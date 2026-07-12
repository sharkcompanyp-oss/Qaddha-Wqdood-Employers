import mongoose from "mongoose";

// نصوص المحاضرات المُستخرَجة (OCR/استخراج) — مرجع الوكيل للحكم على الشكاوى.
// وثيقة واحدة لكل محاضرة، مفتاحها الفريد rel_path = "<القسم>/<المادة>/<الملف>".
const LECTURE_TEXT_SCHEMA = new mongoose.Schema({
  section: { type: String, required: true }, // "طب أسنان" | "تجميل"
  subject: { type: String, required: true }, // اسم مجلد المادة
  file: { type: String, required: true }, // اسم ملف المحاضرة
  rel_path: { type: String, required: true, unique: true }, // مفتاح فريد
  text: { type: String, required: true }, // النص الكامل (Markdown)
  chars: { type: Number, default: 0 },
  updated_at: { type: Date, default: Date.now },
});

// فهرس للبحث السريع ضمن مادة/قسم
LECTURE_TEXT_SCHEMA.index({ section: 1, subject: 1 });

export default mongoose.model("LectureText", LECTURE_TEXT_SCHEMA);
