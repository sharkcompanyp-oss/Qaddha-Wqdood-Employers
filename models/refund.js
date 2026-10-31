import mongoose from "mongoose";

// ─── مرتجع ────────────────────────────────────────────────────────────────────
// طالبٌ مشترك في خطة «معدل» لمادةٍ أنهى امتحانها ولم يرضَ بنتيجته فأُعيد له
// المبلغ. المبلغ يُحفظ لحظة الإرجاع (سعر المعدل يومها): هو المال الذي خرج
// فعلاً، ولا يتغيّر إن عُدّل سعر المادة لاحقاً.
//
// لا يُعدَّل اشتراك الطالب هنا: يبقى في قوائم المادة، والمرتجع يُطرح من
// حصّة الأرباح عند حساب نسبة العضو — لا من «الأرباح» في الإحصائيات.

const refund_schema = new mongoose.Schema(
  {
    exam_id: { type: String, required: true, index: true },
    exam_name: { type: String, default: "" },
    /** _id وثيقة الطالب */
    student_oid: { type: String, required: true, index: true },
    /** الرقم الجامعي نصاً */
    student_ID: { type: String, required: true },
    student_name: { type: String, default: "" },
    amount: { type: Number, required: true },
    note: { type: String, default: "" },
    created_at: { type: Date, default: Date.now },
  },
  { collection: "refunds" },
);

// مرتجعٌ واحد للطالب في المادة الواحدة — الاشتراك يُرَدّ مرةً لا مرتين
refund_schema.index({ exam_id: 1, student_ID: 1 }, { unique: true });

export default mongoose.model("Refund", refund_schema);
