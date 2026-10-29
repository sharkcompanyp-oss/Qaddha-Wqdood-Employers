import {
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import Subjects from "../models/exam.js";
import { R2_READY, r2Client, quotePath } from "./r2_images_controller.js";

dotenv.config();

// ─── متصفّح صور R2 ────────────────────────────────────────────────────────────
// تبويب «الصور» في اللوحة: تصفّح المجلدات كما هي في الحاوية، حجم التخزين
// الكلّي، فحص أي الصور مستعمَلة في المحتوى، والحذف (صوراً أو مجلداً كاملاً).
//
// R2 لا يعرف «مجلدات»: المفاتيح نصوصٌ مثل lectures/المادة/abc123.jpg،
// والمجلد يُستخرج بـDelimiter "/" (CommonPrefixes). الحذف نهائي — لا سلّة
// محذوفات في R2 — ولذلك هذه المسارات للّوحة وحدها (PASSWORD) لا للأعضاء.

const guard = (req, res) => {
  const { PASSWORD } = req.body || {};
  if (!PASSWORD || PASSWORD !== process.env.PASSWORD) {
    res.status(401).json({ message: "غير مصرّح" });
    return false;
  }
  if (!R2_READY()) {
    res.status(503).json({
      message:
        "R2 غير مهيّأ في الخادم — اضبط R2_ACCOUNT_ID و R2_ACCESS_KEY_ID و R2_SECRET_ACCESS_KEY و R2_BUCKET و R2_PUBLIC_URL",
    });
    return false;
  }
  return true;
};

const bucket = () => process.env.R2_BUCKET;
const publicUrl = (key) =>
  `${String(process.env.R2_PUBLIC_URL).replace(/\/+$/, "")}/${quotePath(key)}`;

// البادئة تُطبَّع: بلا شرطة في أولها، وبشرطة في آخرها إن لم تكن فارغة
const normPrefix = (p) => {
  const s = String(p || "").replace(/^\/+/, "");
  return s && !s.endsWith("/") ? `${s}/` : s;
};

/** يمرّ على كل الكائنات تحت بادئة (بلا مجلدات) صفحةً صفحة */
async function* allObjects(prefix) {
  let token;
  do {
    const r = await r2Client().send(
      new ListObjectsV2Command({
        Bucket: bucket(),
        Prefix: prefix || undefined,
        ContinuationToken: token,
        MaxKeys: 1000,
      }),
    );
    for (const o of r.Contents || []) yield o;
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
}

// ── حجم الحاوية ──
// لا يعطي S3/R2 الحجم الكلّي مباشرةً: نعدّه بالمرور على كل الكائنات. على
// حاويةٍ كبيرة يأخذ ثوانيَ، فنحفظه خمس دقائق ونُبطله عند كل حذف.
const USAGE_TTL = 5 * 60_000;
let usageCache = null;

const computeUsage = async () => {
  if (usageCache && Date.now() - usageCache.at < USAGE_TTL) return usageCache.data;
  let bytes = 0;
  let count = 0;
  const byFolder = {}; // البادئة ← { bytes, count } على كل المستويات
  for await (const o of allObjects("")) {
    const size = Number(o.Size) || 0;
    bytes += size;
    count += 1;
    const parts = String(o.Key).split("/");
    for (let i = 1; i < parts.length; i++) {
      const p = `${parts.slice(0, i).join("/")}/`;
      const f = (byFolder[p] ||= { bytes: 0, count: 0 });
      f.bytes += size;
      f.count += 1;
    }
  }
  const data = { bytes, count, by_folder: byFolder, computed_at: new Date().toISOString() };
  usageCache = { at: Date.now(), data };
  return data;
};

/** body: { PASSWORD, fresh? } → { bytes, count, by_folder, computed_at } */
export const R2_Usage = async (req, res) => {
  try {
    if (!guard(req, res)) return;
    if (req.body.fresh) usageCache = null;
    return res.status(200).json(await computeUsage());
  } catch (error) {
    console.error("R2_Usage:", error);
    return res.status(500).json({ message: "تعذّر حساب حجم التخزين" });
  }
};

/**
 * محتوى مجلدٍ واحد: مجلداته الفرعية وملفاته المباشرة — كاملاً بكل الصفحات.
 * body: { PASSWORD, prefix } → { prefix, folders:[{prefix,name}], files:[{key,name,size,last_modified,url}] }
 */
export const R2_List = async (req, res) => {
  try {
    if (!guard(req, res)) return;
    const prefix = normPrefix(req.body.prefix);
    const folders = [];
    const files = [];
    let token;
    do {
      const r = await r2Client().send(
        new ListObjectsV2Command({
          Bucket: bucket(),
          Prefix: prefix || undefined,
          Delimiter: "/",
          ContinuationToken: token,
          MaxKeys: 1000,
        }),
      );
      for (const p of r.CommonPrefixes || []) {
        folders.push({ prefix: p.Prefix, name: p.Prefix.slice(prefix.length).replace(/\/$/, "") });
      }
      for (const o of r.Contents || []) {
        if (o.Key === prefix) continue; // «مجلد» فارغ أُنشئ ككائن بلا محتوى
        files.push({
          key: o.Key,
          name: o.Key.slice(prefix.length),
          size: Number(o.Size) || 0,
          last_modified: o.LastModified,
          url: publicUrl(o.Key),
        });
      }
      token = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (token);

    folders.sort((a, b) => a.name.localeCompare(b.name, "ar"));
    files.sort((a, b) => new Date(b.last_modified) - new Date(a.last_modified));
    return res.status(200).json({ prefix, folders, files });
  } catch (error) {
    console.error("R2_List:", error);
    return res.status(500).json({ message: "تعذّر جلب محتوى المجلد" });
  }
};

/**
 * أيّ هذه الصور مستعمَلة في محتوى المواد؟
 * اسم الملف بصمة محتواه (sha256 مقطوعة)، فوجودها نصّاً في محاضرةٍ ما يعني
 * أن المحاضرة تعرضها. نمرّ على المواد واحدةً واحدة (cursor) لا دفعةً
 * واحدة — محتوى كل المواد معاً عشرات الميغابايتات.
 * body: { PASSWORD, keys:[...] } → { usage: { key: [{subject, lecture}] } }
 */
export const R2_Check_Usage = async (req, res) => {
  try {
    if (!guard(req, res)) return;
    const keys = (Array.isArray(req.body.keys) ? req.body.keys : [])
      .map(String)
      .filter(Boolean)
      .slice(0, 5000);
    // المعرّف الذي يُبحث عنه: اسم الملف بلا امتداد (البصمة)
    const token = (k) => k.split("/").pop().replace(/\.[^.]+$/, "");
    const tokens = keys.map((k) => [k, token(k)]).filter(([, t]) => t.length >= 8);

    const usage = Object.fromEntries(keys.map((k) => [k, []]));
    const cursor = Subjects.find({}, { name: 1, lectures: 1 }).lean().cursor();
    for await (const s of cursor) {
      for (const l of s.lectures || []) {
        const hay = JSON.stringify(l);
        for (const [k, t] of tokens) {
          if (hay.includes(t)) {
            usage[k].push({ subject: s.name, lecture: l.name || l.lecture_id || "" });
          }
        }
      }
    }
    return res.status(200).json({ usage });
  } catch (error) {
    console.error("R2_Check_Usage:", error);
    return res.status(500).json({ message: "تعذّر فحص الاستخدام" });
  }
};

// DeleteObjects يقبل ألف مفتاح في الطلب الواحد
const deleteKeys = async (keys) => {
  let deleted = 0;
  const errors = [];
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    const r = await r2Client().send(
      new DeleteObjectsCommand({
        Bucket: bucket(),
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      }),
    );
    errors.push(...(r.Errors || []).map((e) => e.Key));
    deleted += batch.length - (r.Errors || []).length;
  }
  usageCache = null; // الحجم تغيّر
  return { deleted, errors };
};

/** body: { PASSWORD, keys:[...] } → { deleted, errors } */
export const R2_Delete = async (req, res) => {
  try {
    if (!guard(req, res)) return;
    const keys = [
      ...new Set((Array.isArray(req.body.keys) ? req.body.keys : []).map(String).filter(Boolean)),
    ];
    if (!keys.length) return res.status(400).json({ message: "لم تُحدَّد صور" });
    const r = await deleteKeys(keys);
    console.log(`🗑 R2: حُذف ${r.deleted} صورة${r.errors.length ? ` · فشل ${r.errors.length}` : ""}`);
    return res.status(200).json(r);
  } catch (error) {
    console.error("R2_Delete:", error);
    return res.status(500).json({ message: "تعذّر الحذف" });
  }
};

/**
 * حذف مجلدٍ بكل ما تحته (مجلداته الفرعية أيضاً).
 * البادئة الفارغة مرفوضة: هي الحاوية كلّها.
 * body: { PASSWORD, prefix } → { deleted, errors }
 */
export const R2_Delete_Folder = async (req, res) => {
  try {
    if (!guard(req, res)) return;
    const prefix = normPrefix(req.body.prefix);
    if (!prefix) {
      return res.status(400).json({ message: "لا يُحذف جذر الحاوية كاملاً" });
    }
    const keys = [];
    for await (const o of allObjects(prefix)) keys.push(o.Key);
    if (!keys.length) return res.status(200).json({ deleted: 0, errors: [] });
    const r = await deleteKeys(keys);
    console.log(`🗑 R2: حُذف المجلد «${prefix}» (${r.deleted} ملف)`);
    return res.status(200).json(r);
  } catch (error) {
    console.error("R2_Delete_Folder:", error);
    return res.status(500).json({ message: "تعذّر حذف المجلد" });
  }
};
