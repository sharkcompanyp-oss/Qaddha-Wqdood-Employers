import mongoose from "mongoose";

// ─── تكلفة طلب ذكاء اصطناعي واحد ─────────────────────────────────────────────
// سطرٌ لكل طلبٍ فوتره مزوّد (Mistral · Gemini · Claude): ما عدّه المزوّد
// بنفسه في ردّه (`units`) مضروباً بسعر النموذج ساعة الطلب (`cost_usd`).
// الكلفة تُحفظ لحظتها ولا تُعاد من الأسعار الحالية — رفعُ مزوّدٍ سعره غداً
// لا يغيّر فاتورة الأمس.
//
// `ref` معرّف الطلب لدى المزوّد (رسالة Claude أو دفعته): يمنع تسجيل الطلب
// الواحد مرتين إن أُعيد سؤال الخادم عن نتيجته.

const ai_cost_schema = new mongoose.Schema(
  {
    exam_id: { type: String, default: null, index: true },
    lecture_id: { type: String, default: null },
    /** spell · flash · written · transcribe · ocr · course_extract · mcq · summary_facts · summary_json */
    step: { type: String, required: true },
    provider: { type: String, enum: ["claude", "gemini", "mistral"], required: true },
    model: { type: String, default: "" },
    /** regular | batch */
    mode: { type: String, default: "regular" },
    /** الوحدات كما عدّها المزوّد — tokens أو صفحات */
    units: { type: mongoose.Schema.Types.Mixed, default: {} },
    /** null = لا سعر مضبوط لهذا النموذج بعد — يُملأ عند ضبطه */
    cost_usd: { type: Number, default: null },
    by_kind: { type: String, default: "panel" },
    by_id: { type: String, default: null },
    by_name: { type: String, default: "" },
    ref: { type: String, default: undefined },
    created_at: { type: Date, default: Date.now },
  },
  { collection: "ai_costs" },
);

ai_cost_schema.index({ ref: 1 }, { unique: true, sparse: true });

export default mongoose.model("AiCost", ai_cost_schema);
