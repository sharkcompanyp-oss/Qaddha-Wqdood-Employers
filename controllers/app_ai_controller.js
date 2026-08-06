// إعدادات ذكاء التطبيق (تسري على كل الطلاب) — حالياً: نموذج تصحيح
// الاختبارات التحريرية. منفصلة عن إعدادات وكيل الشكاوى.

import dotenv from "dotenv";
import { listAvailableModels } from "../services/agent/provider.js";
import AppAiSetting from "../models/app_ai_setting.js";

dotenv.config();

function checkPassword(req, res) {
  if (req.body?.PASSWORD !== process.env.PASSWORD) {
    res.status(401).json({ message: "غير مصرّح" });
    return false;
  }
  return true;
}

// إعدادات ذكاء التطبيق + النماذج المتاحة
export const Get_App_AI_Config = async (req, res) => {
  if (!checkPassword(req, res)) return;
  try {
    let setting = await AppAiSetting.findOne({ key: "default" });
    if (!setting) setting = await AppAiSetting.create({ key: "default" });

    const available_models = await listAvailableModels({
      gemini: process.env.GEMINI_API_KEY,
    });

    res.status(200).json({
      setting: {
        grading_provider: setting.grading_provider,
        grading_model: setting.grading_model,
      },
      available_models,
      keys_present: {
        gemini: !!process.env.GEMINI_API_KEY,
        openrouter: !!process.env.OPENROUTER_API_KEY,
      },
    });
  } catch (e) {
    res
      .status(500)
      .json({ message: "خطأ في جلب إعدادات الذكاء", error: e.message });
  }
};

// تحديث نموذج التصحيح (يسري على كل الطلاب خلال دقيقة)
export const Update_App_AI_Config = async (req, res) => {
  if (!checkPassword(req, res)) return;
  try {
    const { grading_provider, grading_model } = req.body;
    const update = { updated_at: new Date() };
    if (grading_provider !== undefined) {
      update.grading_provider = grading_provider;
    }
    if (grading_model !== undefined) update.grading_model = grading_model;

    const setting = await AppAiSetting.findOneAndUpdate(
      { key: "default" },
      { $set: update },
      { new: true, upsert: true },
    );

    res.status(200).json({
      message: "تم حفظ نموذج التصحيح",
      setting: {
        grading_provider: setting.grading_provider,
        grading_model: setting.grading_model,
      },
    });
  } catch (e) {
    res
      .status(500)
      .json({ message: "خطأ في حفظ الإعدادات", error: e.message });
  }
};
