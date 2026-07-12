// كنترولر وكيل معالجة الشكاوى + إعداداته + رفع نصوص المحاضرات.
// محمي بكلمة مرور اللوحة (نفس نمط بقية الكنترولرات).

import dotenv from "dotenv";
import { runAgent } from "../services/agent/runner.js";
import { listAvailableModels } from "../services/agent/provider.js";
import AgentSetting from "../models/agent_setting.js";
import LectureText from "../models/lecture_text.js";

dotenv.config();

function checkPassword(req, res) {
  if (req.body?.PASSWORD !== process.env.PASSWORD) {
    res.status(401).json({ message: "غير مصرّح" });
    return false;
  }
  return true;
}

// GET إعدادات الوكيل + النماذج المتاحة + عدد نصوص المحاضرات
export const Get_Agent_Config = async (req, res) => {
  try {
    let setting = await AgentSetting.findOne({ key: "default" });
    if (!setting) setting = await AgentSetting.create({ key: "default" });
    const lectureCount = await LectureText.estimatedDocumentCount();
    // القائمة الحيّة الكاملة من الـ API (تُحدّث تلقائياً)
    const available_models = await listAvailableModels({
      gemini: process.env.GEMINI_API_KEY,
    });
    res.status(200).json({
      setting: {
        provider: setting.provider,
        model: setting.model,
        dry_run: setting.dry_run,
        threshold: setting.threshold,
        limit: setting.limit,
      },
      available_models,
      lecture_count: lectureCount,
      keys_present: {
        gemini: !!process.env.GEMINI_API_KEY,
        openrouter: !!process.env.OPENROUTER_API_KEY,
        dahl: !!process.env.DAHL_API_KEY,
      },
    });
  } catch (e) {
    res.status(500).json({ message: "خطأ في جلب الإعدادات", error: e.message });
  }
};

// POST تحديث الإعدادات (النموذج/المزوّد/العتبة/المحاكاة/الحد)
export const Update_Agent_Config = async (req, res) => {
  if (!checkPassword(req, res)) return;
  try {
    const { provider, model, dry_run, threshold, limit } = req.body;
    const update = { updated_at: new Date() };
    if (provider !== undefined) update.provider = provider;
    if (model !== undefined) update.model = model;
    if (dry_run !== undefined) update.dry_run = dry_run;
    if (threshold !== undefined) update.threshold = Number(threshold);
    if (limit !== undefined) update.limit = Number(limit);
    const setting = await AgentSetting.findOneAndUpdate(
      { key: "default" },
      { $set: update },
      { new: true, upsert: true },
    );
    res.status(200).json({ message: "تم حفظ الإعدادات", setting });
  } catch (e) {
    res.status(500).json({ message: "خطأ في حفظ الإعدادات", error: e.message });
  }
};

// POST تشغيل الوكيل (يقبل تجاوزات لمرة واحدة اختيارياً)
export const Run_Agent = async (req, res) => {
  if (!checkPassword(req, res)) return;
  try {
    const { provider, model, dry_run, threshold, limit } = req.body;
    const overrides = {};
    if (provider !== undefined) overrides.provider = provider;
    if (model !== undefined) overrides.model = model;
    if (dry_run !== undefined) overrides.dry_run = dry_run;
    if (threshold !== undefined) overrides.threshold = Number(threshold);
    if (limit !== undefined) overrides.limit = Number(limit);
    const summary = await runAgent({ overrides });
    res.status(200).json(summary);
  } catch (e) {
    res.status(500).json({ message: "فشل تشغيل الوكيل", error: e.message });
  }
};

// POST رفع نصوص محاضرات (دفعة). كل عنصر: {section, subject, file, text}
// يُحدّث بالمفتاح rel_path (idempotent).
export const Upload_Lectures = async (req, res) => {
  if (!checkPassword(req, res)) return;
  try {
    const items = Array.isArray(req.body?.lectures) ? req.body.lectures : [];
    if (!items.length)
      return res.status(400).json({ message: "لا توجد محاضرات للرفع" });

    let upserted = 0;
    const skipped = [];
    for (const it of items) {
      const section = (it.section || "").trim();
      const subject = (it.subject || "").trim();
      const file = (it.file || "").trim();
      const text = it.text || "";
      if (!section || !subject || !file || !text.trim()) {
        skipped.push(file || "(بلا اسم)");
        continue;
      }
      const rel_path = `${section}/${subject}/${file}`;
      await LectureText.updateOne(
        { rel_path },
        {
          $set: {
            section,
            subject,
            file,
            rel_path,
            text,
            chars: text.length,
            updated_at: new Date(),
          },
        },
        { upsert: true },
      );
      upserted += 1;
    }
    const total = await LectureText.estimatedDocumentCount();
    res.status(200).json({
      message: `تم رفع/تحديث ${upserted} محاضرة`,
      upserted,
      skipped,
      total,
    });
  } catch (e) {
    res.status(500).json({ message: "فشل رفع المحاضرات", error: e.message });
  }
};

// GET ملخّص نصوص المحاضرات (قسم → مادة → عدد) لعرضه في اللوحة
export const Get_Lectures_Summary = async (req, res) => {
  try {
    const rows = await LectureText.aggregate([
      {
        $group: {
          _id: { section: "$section", subject: "$subject" },
          count: { $sum: 1 },
        },
      },
    ]);
    const tree = {};
    for (const r of rows) {
      const sec = (tree[r._id.section] ||= {});
      sec[r._id.subject] = r.count;
    }
    res.status(200).json({ tree, total: rows.reduce((a, r) => a + r.count, 0) });
  } catch (e) {
    res.status(500).json({ message: "خطأ في ملخّص المحاضرات", error: e.message });
  }
};
