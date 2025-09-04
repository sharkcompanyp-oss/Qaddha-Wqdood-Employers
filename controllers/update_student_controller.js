import Student from "../models/student.js";
/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const Update_Student = async (req, res) => {
  try {
    const { name, ID, new_name, new_id, new_college_id } = req.body;
    const The_Student = await Student.findOne({ ID: ID });
    The_Student.name = new_name;
    The_Student.ID = new_id;
    The_Student.college_id = new_college_id;
    await The_Student.save();
    res.status(200).json(The_Student);
  } catch (error) {
    res.status(500).json({ message: "تحقق من اتصالك بالانترنت" });
  }
};
