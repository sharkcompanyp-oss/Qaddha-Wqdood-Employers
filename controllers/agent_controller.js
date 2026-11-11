// كنترولر وكيل معالجة الشكاوى + إعداداته.
// محمي بكلمة مرور اللوحة (نفس نمط بقية الكنترولرات).

import dotenv from "dotenv";
import { runAgent } from "../services/agent/runner.js";
import { listAvailableModels } from "../services/agent/provider.js";
import AgentSetting from "../models/agent_setting.js";

dotenv.config();

function checkPassword(req, res) {
  if (req.body?.PASSWORD !== process.env.PASSWORD) {
    res.status(401).json({ message: "غير مصرّح" });
    return false;
  }
  return true;
}

// GET إعدادات الوكيل + النماذج المتاحة
export const Get_Agent_Config = async (req, res) => {
  try {
    let setting = await AgentSetting.findOne({ key: "default" });
    if (!setting) setting = await AgentSetting.create({ key: "default" });
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
        // كانت محذوفة من الإسقاط: الواجهة تقرأ منه، فكانت قائمة الأمثلة
        // تعود فارغةً بعد كل تحديث للصفحة وإن كانت محفوظة فعلاً — ثم يمحوها
        // أوّل «حفظ» لأن الواجهة ترسل ما تراه.
        reply_examples: setting.reply_examples || [],
      },
      available_models,
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
    const { provider, model, dry_run, threshold, limit, reply_examples } =
      req.body;
    const update = { updated_at: new Date() };
    if (provider !== undefined) update.provider = provider;
    if (model !== undefined) update.model = model;
    if (dry_run !== undefined) update.dry_run = dry_run;
    if (threshold !== undefined) update.threshold = Number(threshold);
    if (limit !== undefined) update.limit = Number(limit);
    // الأمثلة تُستبدل كاملةً: الإضافة والحذف يجريان في الواجهة على النسخة
    // الحالية، فالإرسال الجزئي كان سيخسر ما لم يُرسَل.
    if (Array.isArray(reply_examples)) {
      update.reply_examples = reply_examples
        .map((s) => String(s || "").trim())
        .filter(Boolean)
        .slice(0, 50);
    }
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
