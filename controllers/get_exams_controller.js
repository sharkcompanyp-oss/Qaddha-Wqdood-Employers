/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
import Exams from "../models/exam.js";
import dotenv from "dotenv";

dotenv.config();

export const Get_Exams = async (req, res) => {
  const { searchTerm, PASSWORD } = req.body;
  try {
    let exams;
    if (!PASSWORD || PASSWORD !== process.env.PASSWORD) {
      res.status(401).json({ message: "تعذر جلب الاختبار" });
    }
    if (searchTerm) {
      const regex = new RegExp(searchTerm, "i"); // بحث غير حساس لحالة الأحرف
      exams = await Exams.find({
        $or: [{ name: regex }, { ID: searchTerm }],
      });
      console.log(exams);
    } else {
      exams = await Exams.find();
    }

    res.json(exams);
  } catch (error) {
    console.error("خطأ في Get_Exams:", error.message); // سجل الخطأ
    res.status(500).json({ message: "تأكد من اتصالك بالانترنت" });
  }
};
