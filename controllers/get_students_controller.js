/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
import Students from "../models/student.js";
export const Get_Students = async (req, res) => {
  try {
    const students = await Students.find();
    res.json(students);
  } catch (error) {
    res.status(500).json({ message: "تأكد من اتصالك بالانترنت" });
  }
};
