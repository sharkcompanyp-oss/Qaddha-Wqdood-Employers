import Student from "../models/student.js";
export const Health = async (req, res) => {
  try {
    const All_Students_Without_Goal = await Student.findOne({ ID: "2330040" });
    if (!All_Students_Without_Goal) {
      res.status(404).json({ message: "Not A Problem" });
    }
    res.status(200).json("K");
  } catch (error) {
    console.log("===== ERROR =====\n", error);
  }
};
