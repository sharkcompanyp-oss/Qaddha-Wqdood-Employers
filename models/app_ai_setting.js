import mongoose from "mongoose";

// إعدادات ذكاء التطبيق (لكل الطلاب) — وثيقة مفردة (singleton) تُضبط من لوحة
// التحكم، ويقرأها باك اند الطلاب عند كل تصحيح. منفصلة عن إعدادات وكيل
// الشكاوى حتى لا يؤثر تغيير أحدهما في الآخر.
// ⚠ متطابق حرفياً مع نظيره في باك اند الطلاب (نفس قاعدة البيانات).
const APP_AI_SETTING_SCHEMA = new mongoose.Schema({
  key: { type: String, default: "default", unique: true },

  // تصحيح الاختبارات التحريرية
  grading_provider: { type: String, default: "gemini" },
  grading_model: { type: String, default: "gemini-2.5-flash" },

  updated_at: { type: Date, default: Date.now },
});

export default mongoose.model("AppAiSetting", APP_AI_SETTING_SCHEMA);
