import mongoose from "mongoose";

// دفتر حركات النقاط — كل تغيير على نقاط طالب يمر من هنا.
// Student.points يبقى مجموعاً مخبأً (Cache) يُحدَّث مع كل حركة.
// ⚠ متطابق حرفياً مع نظيره في باك اند الطلاب (نفس قاعدة البيانات).
const POINTS_LEDGER_SCHEMA = new mongoose.Schema({
  student_ID: { type: String, required: true },
  delta: { type: Number, required: true }, // موجب = كسب، سالب = خصم
  // quiz_points | note_approved | record_sent | full_course |
  // extra_lecture | complaint_valid | manual | subscription_payment
  reason_code: { type: String, required: true },
  note: { type: String, required: false, default: "" }, // نص حر يظهر للطالب
  source_type: { type: String, required: false, default: "" }, // exam | complaint | admin...
  source_id: { type: String, required: false, default: "" },
  admin_name: { type: String, required: false, default: "" },
  created_at: { type: Date, default: Date.now },
});

POINTS_LEDGER_SCHEMA.index({ student_ID: 1, created_at: -1 });

export default mongoose.model("PointsLedger", POINTS_LEDGER_SCHEMA);
