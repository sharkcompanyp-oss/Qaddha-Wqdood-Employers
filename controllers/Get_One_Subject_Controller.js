import Exams from "../models/exam.js";
export const Get_One_Subject = async (req, res) => {
  try {
    const { _id } = req.body;
    const The_Exam = await Exams.findOne({ _id: _id });
    if (!The_Exam) {
      res.status(404).json({ message: "المادة غير موجودة" });
    }
    res.status(200).json(The_Exam);
  } catch (err) {
    res.status(500).json("حدث خطأ في الخادم.");
  }
};
