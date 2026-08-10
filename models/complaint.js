import mongoose from "mongoose";
const COMPLAINT_SCHEMA = mongoose.Schema({
  student_ID: { type: String, required: true },
  type: { type: String, required: true },
  section_id: { type: String, required: false },
  lecture_name: { type: String, required: false },
  subject_name: { type: String, required: false },
  college_name: { type: String, required: false },
  university_name: { type: String, required: false },
  question: { type: String, required: false },
  student_name: { type: String, required: false },
  whatsapp_number: { type: String, required: false },
  complaint: { type: String, required: false },

  // ─── المعرّفان الحاسمان ─────────────────────────────────────────────────────
  // الأسماء وحدها لا تكفي للوصول إلى المحتوى: يكتبها الطالب بيده فتتصحّف،
  // وتتكرر المادة الواحدة بين كليات. بهذين يفتح الوكيل المحاضرة بعينها
  // بلا تخمين — وهو شرط أن يعدّل الحقل الصحيح.
  subject_id: { type: String, required: false, default: "" },
  lecture_id: { type: String, required: false, default: "" },

  // ─── أثر المعالجة ───────────────────────────────────────────────────────────
  status: {
    type: String,
    enum: ["new", "valid", "invalid", "fixed"],
    default: "new",
  },
  // ما غيّره الوكيل فعلاً — سجلٌّ يُراجَع، فالتعديل الآلي بلا أثرٍ خطر
  applied_fix: {
    kind: { type: String, default: "" }, // question | option | summary | flash | written | curriculum
    field: { type: String, default: "" },
    before: { type: String, default: "" },
    after: { type: String, default: "" },
    at: { type: Date, default: null },
  },
  points_awarded: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
});

export default mongoose.model("complaint", COMPLAINT_SCHEMA);
