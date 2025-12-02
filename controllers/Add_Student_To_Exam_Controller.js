import Subjects from "../models/exam.js";
/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const Add_Student_To_Exam = async (req, res) => {
  try {
    const { STUDENT_ID, EXAM_ID } = req.body;
    const The_Exam = await Subjects.findOne({ ID: EXAM_ID });
    if (!The_Exam) {
      return res.status(404).json({ message: "الاختبار غير موجود" });
    }
    const studentExists = The_Exam.available_to.includes(String(STUDENT_ID));
    if (studentExists) {
      return res.status(400).json({
        message: "الطالب مضاف بالفعل لهذا الاختبار",
      });
    }
    The_Exam.available_to.push(String(STUDENT_ID));
    await The_Exam.save();
    return res.status(200).json({ message: "تمت إضافة الطالب بنجاح" });
  } catch (error) {
    res.status(500).json({ message: "تحقق من اتصالك بالانترنت" });
  }
};
