import mongoose from "mongoose";

// ─── تصنيفات الأسئلة (كولكشن مستقل عن المواد) ─────────────────────────────────
// مستند واحد لكل مادة (subject_id فريد). يحمل نسخة كاملة من الأسئلة المصنّفة
// بنفس صيغة استيراد JSON في واجهة MCQ Classifier — انسخ مصفوفة questions
// من Compass والصقها في صندوق الاستيراد مباشرة.
//
// التصنيفات: "accepted" (سؤال حي لم يُلمس/عُدّل وأُقرّ) |
// "needs_edit" (النسخة الأصلية قبل التعديل) | "rejected" (سؤال محذوف)
// مستند المادة نفسه (Subjects) يبقى نظيفاً بلا أي حقول تصنيف.

const QUESTION_CLASSIFICATIONS_SCHEMA = mongoose.Schema({
  // _id المادة في كولكشن Subjects
  subject_id: { type: String, required: true, unique: true },
  // اسم المادة (لتسهيل إيجاد المستند في Compass فقط)
  subject_name: { type: String, required: false, default: "" },
  questions: {
    type: [
      {
        question: { type: String, required: false, default: "" },
        options: { type: [String], required: false, default: [] },
        answer: { type: String, required: false, default: "" },
        lecture: { type: String, required: false, default: "" },
        classification: { type: String, required: false, default: "" },
        // 1 = قرار بشري من المحرر، وإلا ثقة النموذج (0 إلى 1)
        classification_confidence: {
          type: Number,
          required: false,
          default: 0,
        },
        logged_at: { type: Date, required: false, default: Date.now },
        _id: false,
      },
    ],
    required: false,
    default: [],
  },
  updated_at: { type: Date, required: false, default: Date.now },
});

export default mongoose.model(
  "QuestionClassifications",
  QUESTION_CLASSIFICATIONS_SCHEMA,
);
