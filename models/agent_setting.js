import mongoose from "mongoose";

// إعدادات وكيل معالجة الشكاوى — وثيقة مفردة (singleton) قابلة للتعديل من لوحة
// التحكم. كل شيء هنا قابل للتغيير مستقبلاً (نماذج/مزوّدون/أدوات) دون لمس الكود.
const AGENT_SETTING_SCHEMA = new mongoose.Schema({
  key: { type: String, default: "default", unique: true },

  // المزوّد والنموذج المختار حالياً
  provider: { type: String, default: "gemini" }, // "gemini" | "openrouter"
  model: { type: String, default: "gemini-2.0-flash" },

  // سلوك الحكم
  dry_run: { type: Boolean, default: true }, // محاكاة: لا كتابة ولا إشعار
  threshold: { type: Number, default: 0.85 }, // عتبة الثقة للتصحيح الإملائي الآلي
  limit: { type: Number, default: 0 }, // 0 = كل الشكاوى

  updated_at: { type: Date, default: Date.now },
});

export default mongoose.model("AgentSetting", AGENT_SETTING_SCHEMA);
