import mongoose from "mongoose";

// ─── خطة دراسية (قراءة/حذف فقط من لوحة التحكم) ───────────────────────────────
// المالك الحقيقي للمخطط هو باك اند الطلاب (`EXAMS/backend/models/StudyPlan.js`).
// هنا نُعرّف الحد الأدنى اللازم للحذف عند إلغاء تسجيل طالب في مادة.
//
// ⚠ اسم الموديل `StudyPlan` مقصود حرفياً: منه تشتقّ Mongoose اسم المجموعة
// (`studyplans`) — أي تغيير فيه يجعلنا نكتب في مجموعة أخرى فارغة.
// و`strict: false` يمنع أي حذف/تجاهل لحقول لا نعرفها هنا.
const STUDY_PLAN_SCHEMA = new mongoose.Schema(
  {
    student_ID: { type: String, required: true },
    subject_id: { type: String, required: true },
    subject_name: { type: String },
  },
  { strict: false },
);

export default mongoose.models.StudyPlan ||
  mongoose.model("StudyPlan", STUDY_PLAN_SCHEMA);
