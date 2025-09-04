/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
import Exams from "../models/exam.js";

export const Get_Exams = async (req, res) => {
  const { searchTerm } = req.body;

  try {
    let exams;

    if (searchTerm) {
      const regex = new RegExp(searchTerm, "i"); // بحث غير حساس لحالة الأحرف
      exams = await Exams.find({
        $or: [
          { name: regex },
          { ID: isNaN(searchTerm) ? undefined : Number(searchTerm) },
        ],
      });
    } else {
      exams = await Exams.find();
    }

    res.json(exams);
  } catch (error) {
    console.error("خطأ في Get_Exams:", error.message); // سجل الخطأ
    res.status(500).json({ message: "تأكد من اتصالك بالانترنت" });
  }
};
