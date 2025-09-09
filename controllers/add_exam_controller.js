import Exams from "../models/exam.js";
/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const Add_Exam = async (req, res) => {
  try {
    const { name, ID, college_id, info, questions, time, visible, price } =
      req.body;
    const New_Exam = new Exams({
      name: name,
      ID: ID,
      college_id: college_id,
      info: info,
      questions: questions,
      time: time,
      visible: visible || false,
      available_to: [],
      open_mode: false,
      price: price || 0,
    });
    await New_Exam.save();
    res.status(200).json({ message: "تمت إضافة الاختبار" });
  } catch (error) {
    res.status(500).json({ error });
  }
};
