import Students from "../models/student.js";
import Subject from "../models/exam.js";
import complaint from "../models/complaint.js";
/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const Get_Complaints = async (req, res) => {
  try {
    const Complaints = await complaint.find();
    res.status(200).json(Complaints);
  } catch (error) {
    res.status(500).json({ message: "تحقق من اتصالك بالانترنت" });
  }
};
