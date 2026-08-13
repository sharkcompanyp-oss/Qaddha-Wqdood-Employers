import mongoose from "mongoose";

// ─── الموجّهات المحفوظة ───────────────────────────────────────────────────────
// وثيقة واحدة (key: "default") تحمل ما عدّله المحرِّر فقط. الغائب يعود إلى
// نسخة المصنع في `services/prompts_defaults.js` — فحذف مفتاح من هنا هو نفسه
// «أعِد الافتراضي»، ولا يحتاج نسخ النصّ الأصلي إلى القاعدة ليعمل.
//
// `Map` لا كائن: مفاتيح الموجّهات تُضاف مع كل وكيل جديد، وschema ثابتٌ بحقول
// معدودة كان سيتطلّب هجرةً في كل مرة.

const prompt_setting_schema = new mongoose.Schema(
  {
    key: { type: String, default: "default", unique: true, index: true },
    /** اسم الموجّه ← نصّه المعدَّل */
    prompts: { type: Map, of: String, default: () => new Map() },
    /** اسم العدد ← قيمته المعدَّلة */
    numbers: { type: Map, of: Number, default: () => new Map() },
    updated_at: { type: Date, default: Date.now },
  },
  { collection: "prompt_settings" },
);

export default mongoose.model("PromptSetting", prompt_setting_schema);
