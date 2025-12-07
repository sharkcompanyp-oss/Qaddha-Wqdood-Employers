import Exams from "../models/exam.js";
import dotenv from "dotenv";

dotenv.config();

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const Delete_Exam = async (req, res) => {
  try {
    const { exam_id, PASSWORD } = req.body;

    // التحقق من كلمة المرور
    if (!PASSWORD || PASSWORD !== process.env.PASSWORD) {
      return res.status(401).json({ message: "تعذر حذف الاختبار" });
    }

    // التحقق من وجود المعرف
    if (!exam_id) {
      return res.status(400).json({ message: "معرف الاختبار مفقود" });
    }

    const The_Exam = await Exams.findOne({ _id: exam_id });

    // في حال لم يتم العثور على الاختبار
    if (!The_Exam) {
      return res.status(404).json({ message: "لم يتم العثور على الاختبار" });
    }

    await The_Exam.deleteOne();

    res.status(200).json({ message: "تم حذف الاختبار بنجاح" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "حدث خطأ، تحقق من اتصالك بالإنترنت" });
  }
};
