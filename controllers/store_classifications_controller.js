import Exams from "../models/exam.js";
import QuestionClassifications from "../models/question_classification.js";

const VALID_LABELS = ["accepted", "needs_edit", "rejected", ""];

/**
 * استقبال أسئلة مصنّفة (من نموذج MCQ Classifier) وتخزين تصنيفها في
 * الكولكشن المستقل QuestionClassifications — مستند المادة نفسه لا يُمسّ.
 *
 * POST /storeclassifications
 * body: {
 *   subject_id: "<_id المادة>",
 *   classifications: [
 *     {
 *       question: "<نص السؤال كما هو مخزّن>",
 *       classification: "accepted" | "needs_edit" | "rejected" | "",
 *       confidence: 0.93   // اختياري (0 إلى 1)
 *     }, ...
 *   ]
 * }
 *
 * المطابقة بنص السؤال:
 * - إن وُجد السؤال في مستند التصنيفات ← يُحدَّث تصنيفه وثقته.
 * - وإلا إن وُجد في أسئلة المادة ← يُضاف بكامل بياناته (خيارات/جواب/محاضرة).
 * - التصنيف "" يحذف السؤال من مستند التصنيفات.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const Store_Classifications = async (req, res) => {
  try {
    const { subject_id, classifications } = req.body;

    if (!subject_id) {
      return res.status(400).json({ message: "رمز المادة ناقص" });
    }
    if (!Array.isArray(classifications) || classifications.length === 0) {
      return res.status(400).json({ message: "قائمة التصنيفات فارغة" });
    }

    const The_Exam = await Exams.findOne({ _id: subject_id });
    if (!The_Exam) {
      return res.status(404).json({ message: "المادة غير موجودة" });
    }

    let doc = await QuestionClassifications.findOne({
      subject_id: String(The_Exam._id),
    });
    if (!doc) {
      doc = new QuestionClassifications({
        subject_id: String(The_Exam._id),
        questions: [],
      });
    }

    // أسئلة المادة بنصّها — لإكمال بيانات الأسئلة المضافة لأول مرة
    const exam_map = new Map();
    for (const q of The_Exam.questions || []) {
      exam_map.set(q.question, q);
    }

    let updated = 0;
    let not_found = 0;
    for (const item of classifications) {
      if (!item || typeof item.question !== "string") continue;
      if (!VALID_LABELS.includes(item.classification)) continue;

      const confidence =
        typeof item.confidence === "number"
          ? Math.max(0, Math.min(1, item.confidence))
          : 0;

      const existing = doc.questions.find(
        (e) => e.question === item.question,
      );

      if (item.classification === "") {
        // مسح التصنيف = حذف السؤال من مستند التصنيفات
        if (existing) {
          doc.questions = doc.questions.filter(
            (e) => e.question !== item.question,
          );
          updated += 1;
        }
        continue;
      }

      if (existing) {
        existing.classification = item.classification;
        existing.classification_confidence = confidence;
        existing.logged_at = new Date();
        updated += 1;
      } else if (exam_map.has(item.question)) {
        const q = exam_map.get(item.question);
        doc.questions.push({
          question: q.question,
          options: [...(q.options || [])],
          answer: String(q.answer ?? ""),
          lecture: q.lecture || "",
          classification: item.classification,
          classification_confidence: confidence,
          logged_at: new Date(),
        });
        updated += 1;
      } else {
        not_found += 1;
      }
    }

    doc.subject_name = The_Exam.name || "";
    doc.updated_at = new Date();
    await doc.save();

    res.status(200).json({
      message: "تم تخزين التصنيفات",
      updated,
      not_found,
      total_classified: doc.questions.length,
    });
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ message: "تحقق من اتصالك بالانترنت", error: error.message });
  }
};
