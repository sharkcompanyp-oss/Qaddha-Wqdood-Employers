import Exams from "../models/exam.js";

const VALID_LABELS = ["accepted", "needs_edit", "rejected", ""];

/**
 * استقبال أسئلة مصنّفة (من نموذج MCQ Classifier) وتخزين تصنيفها في القاعدة.
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
 * المطابقة تتم بنص السؤال. التصنيف "" يمسح تصنيف السؤال.
 * كل الحقول اختيارية بالسكيمة، فما في أي تأثير على التطبيقات الحالية.
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

    // خريطة: نص السؤال -> التصنيف الوارد
    const incoming = new Map();
    for (const item of classifications) {
      if (!item || typeof item.question !== "string") continue;
      if (!VALID_LABELS.includes(item.classification)) continue;
      incoming.set(item.question, item);
    }

    let updated = 0;
    for (const q of The_Exam.questions) {
      const match = incoming.get(q.question);
      if (!match) continue;
      q.classification = match.classification;
      q.classification_confidence =
        typeof match.confidence === "number"
          ? Math.max(0, Math.min(1, match.confidence))
          : 0;
      updated += 1;
    }

    await The_Exam.save();

    res.status(200).json({
      message: "تم تخزين التصنيفات",
      updated,
      not_found: incoming.size - updated,
      total_questions: The_Exam.questions.length,
    });
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ message: "تحقق من اتصالك بالانترنت", error: error.message });
  }
};
