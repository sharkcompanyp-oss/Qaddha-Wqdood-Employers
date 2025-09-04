import Exams from "../models/exam.js";
/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const Delete_Exam = async (req, res) => {
  try {
    const { exam_id } = req.body;
    const The_Exam = await Exams.findOne({ ID: exam_id });
    await The_Exam.deleteOne();
    res.status(200).json({ message: "تم حذف الاختبار بنجاح " });
  } catch (error) {
    res.status(500).json({ message: "تحقق من اتصالك بالانترنت" });
  }
};
