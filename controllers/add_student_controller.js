import Students from "../models/student.js";
/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const Add_Student = async (req, res) => {
  try {
    const { name, ID } = req.body;
    const New_Student = new Students({ name: name, ID: ID });
    await New_Student.save();
    res.json(New_Student);
  } catch (error) {
    res.status(500).json({ message: "تحقق من اتصالك بالانترنت" });
  }
};
