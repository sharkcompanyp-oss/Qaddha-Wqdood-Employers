import mongoose from "mongoose";

// ─── سجل جلسة تعديل واحدة على مادة ──────────────────────────────────────────────
const EditSessionSchema = new mongoose.Schema(
  {
    subject_id: { type: String, required: false, default: "" },
    subject_name: { type: String, required: false, default: "" },
    edited_at: { type: Date, required: false, default: Date.now },
    // الوقت المنقضي من بدء التعديل إلى الحفظ (بالثواني)
    elapsed_seconds: { type: Number, required: false, default: 0 },
  },
  { _id: false },
);

// ─── سكيما العضو ───────────────────────────────────────────────────────────────
// ملاحظة: كلمات المرور تُخزَّن كنص صريح عمداً (غير مشفّرة) ليتمكّن المدير من
// تغييرها في حالات الطوارئ من لوحة التحكم الأساسية.
const EMPLOYER_SCHEMA = new mongoose.Schema({
  name: { type: String, required: true },
  phone_number: { type: String, required: true },
  password1: { type: String, required: true },
  password2: { type: String, required: true },
  password3: { type: String, required: true },
  // سجل كل جلسات التعديل التي قام بها العضو
  sessions: { type: [EditSessionSchema], required: false, default: [] },
  created_at: { type: Date, required: false, default: Date.now },
});

export default mongoose.model("employer", EMPLOYER_SCHEMA);
