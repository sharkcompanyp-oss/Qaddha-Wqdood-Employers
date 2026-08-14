import crypto from "crypto";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import { allowTool } from "../services/access.js";

dotenv.config();

// ─── رفع صور المحاضرات إلى Cloudflare R2 ──────────────────────────────────────
// منقول عن r2_images.py بأمانة، مع تقسيمٍ مختلف للعمل:
//
//   الواجهة: تضغط الصور إن استطاعت (canvas في المتصفّح) — لأنها تملكها
//             أصلاً من Mistral. لوحة الهاتف بلا canvas فترفعها خاماً.
//             **ولا ترشيح في أيّهما**: كل صورة تُرفَع، وحذفها شأن المحرِّر
//             في خطوة المعاينة.
//   الخادم:   يبصم ويرفع — لأن مفاتيح R2 سرّية ولا يجوز أن تصل المتصفّح.
//             (مفتاح Mistral وحده في الواجهة، وهو يتجدّد كل ساعة فليس سرّاً.)
//
// المفتاح بصمةُ المحتوى: الصورة نفسها لا تُرفع مرتين مهما تكرّرت بين المحاضرات.

const R2_READY = () =>
  Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET &&
      process.env.R2_PUBLIC_URL,
  );

let _client = null;
const client = () => {
  if (_client) return _client;
  _client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  return _client;
};

/** نظير quote(key, safe='/') في بايثون: يرمّز كل شيء إلا الشرطة المائلة.
 *  إلزامي لأن أسماء المواد عربية وفيها مسافات، والمسافة تقطع رابط
 *  الماركداون عند أول فراغ فيظهر نصّاً بدل صورة ويعطي 404. */
export const quotePath = (key) =>
  key
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");

/** نفس تنظيف بايثون: isalnum يشمل العربية (Unicode) فنستعمل \p{L}\p{N} */
export const safeSubject = (s) =>
  String(s || "")
    .split("")
    .filter((c) => /[\p{L}\p{N} _-]/u.test(c))
    .join("")
    .slice(0, 40)
    .trim();

/** يستنتج نوع الصورة من بصمتها لا من امتدادها.
 *
 *  كانت كل صورة تُخزَّن `.jpg` بنوع `image/jpeg` — وكان ذلك صحيحاً ما دامت
 *  اللوحة تمرّرها على canvas فتخرج JPEG دائماً. الهاتف لا يملك canvas فيرفعها
 *  خاماً كما عادت من Mistral، وقد تكون PNG. تسميتها jpg عندها تجعل التخزين
 *  يكذب على القارئ، وبعض العملاء يرفض عرضها. */
const sniffImage = (buf) => {
  if (buf.length > 8 && buf[0] === 0x89 && buf.toString("latin1", 1, 4) === "PNG")
    return { ext: "png", type: "image/png" };
  if (buf.length > 12 && buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP")
    return { ext: "webp", type: "image/webp" };
  if (buf.length > 3 && buf.toString("latin1", 0, 3) === "GIF")
    return { ext: "gif", type: "image/gif" };
  // الافتراضي JPEG: هو ما يعيده Mistral في الغالب وما ينتجه canvas دائماً
  return { ext: "jpg", type: "image/jpeg" };
};

export const Upload_Lecture_Images = async (req, res) => {
  try {
    const { subject, images } = req.body || {};
    if (!(await allowTool(req, res))) return;
    if (!R2_READY()) {
      // لا نُفشل المسح كلّه: النصّ أهمّ من الصور، والمتصفّح يُكمل بلا روابط.
      return res.status(200).json({
        ok: false,
        disabled: true,
        message:
          "R2 غير مهيّأ في الخادم — سيُستخرج النصّ بلا صور. اضبط R2_ACCOUNT_ID و R2_ACCESS_KEY_ID و R2_SECRET_ACCESS_KEY و R2_BUCKET و R2_PUBLIC_URL.",
        urls: {},
      });
    }
    if (!Array.isArray(images) || images.length === 0) {
      return res.status(200).json({ ok: true, urls: {}, uploaded: 0, deduped: 0 });
    }

    const bucket = process.env.R2_BUCKET;
    const base = String(process.env.R2_PUBLIC_URL).replace(/\/+$/, "");
    const subj = safeSubject(subject) || "عام";

    const urls = {};
    let uploaded = 0;
    let deduped = 0;
    const failed = [];

    for (const img of images) {
      const name = img?.name;
      const b64 = img?.b64;
      if (!name || !b64) continue;
      try {
        const data = Buffer.from(
          b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64,
          "base64",
        );
        if (!data.length) continue;

        const digest = crypto
          .createHash("sha256")
          .update(data)
          .digest("hex")
          .slice(0, 16);
        const { ext, type } = sniffImage(data);
        const key = `lectures/${subj}/${digest}.${ext}`;

        let exists = false;
        try {
          await client().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
          exists = true;
        } catch {
          exists = false;
        }

        if (exists) {
          deduped += 1;
        } else {
          await client().send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: key,
              Body: data,
              ContentType: type,
              CacheControl: "public, max-age=31536000, immutable",
            }),
          );
          uploaded += 1;
        }
        urls[name] = `${base}/${quotePath(key)}`;
      } catch (e) {
        // صورة واحدة تفشل لا تُسقط المحاضرة — تُحذف إشارتها ويكمل النصّ
        failed.push({ name, error: String(e?.message || e).slice(0, 120) });
      }
    }

    return res.status(200).json({
      ok: true,
      urls,
      uploaded,
      deduped,
      failed,
      // التفريق مقصود: العدّاد الموحّد كان يقول «رُفعت 502 صورة» والمخزَّن 323
      message: `رُفعت ${uploaded} صورة، وتكرّرت ${deduped}`,
    });
  } catch (error) {
    console.error("Upload_Lecture_Images:", error);
    return res
      .status(500)
      .json({ message: "تعذّر رفع الصور", error: error.message });
  }
};

/** فحص جاهزية R2 — تعرضه الواجهة قبل بدء المسح فلا يكتشف المستخدم
 *  غياب الإعداد بعد أربعين دقيقة من المسح. */
export const R2_Status = async (req, res) => {
  if (!(await allowTool(req, res))) return;
  return res.status(200).json({
    ready: R2_READY(),
    bucket: R2_READY() ? process.env.R2_BUCKET : null,
    public_url: R2_READY() ? process.env.R2_PUBLIC_URL : null,
  });
};
