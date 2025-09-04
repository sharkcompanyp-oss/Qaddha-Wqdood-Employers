import Students from "../models/student.js";
/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const Delete_Student = async (req, res) => {
  try {
    const { name, ID } = req.body;
    const The_Student = await Students.findOne({ ID: ID, name: name });
    await The_Student.deleteOne();
    res.status(200).json({ message: "تم حذف الطالب" });
  } catch (error) {
    res.status(500).json({ message: "تحقق من اتصالك بالانترنت" });
  }
};
