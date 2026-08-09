import mongoose from "mongoose";

// مهام الخطة — تُحذف مع خطتها. (المخطط الكامل في باك اند الطلاب.)
// اسم الموديل `StudyTask` يجب أن يبقى كما هو ⇒ المجموعة `studytasks`.
const STUDY_TASK_SCHEMA = new mongoose.Schema(
  {
    plan_id: { type: String, required: true },
    student_ID: { type: String, required: true },
    subject_id: { type: String, required: true },
  },
  { strict: false },
);

export default mongoose.models.StudyTask ||
  mongoose.model("StudyTask", STUDY_TASK_SCHEMA);
