import Students from "../models/student.js";
import dotenv from "dotenv";
dotenv.config();

export const Get_Students = async (req, res) => {
  const { searchTerm, PASSWORD } = req.body;
  try {
    if (!PASSWORD || PASSWORD !== process.env.PASSWORD) {
      return res.status(401).json({ message: "تعذر جلب الطالب" });
    }

    let students;

    if (searchTerm) {
      const regex = new RegExp(searchTerm, "i"); // بحث غير حساس لحالة الأحرف
      students = await Students.find({
        $or: [{ name: regex }, { ID: searchTerm }],
      });
    } else {
      students = await Students.find();
    }

    res.json(students);
  } catch (error) {
    console.error("Get Students Error : ", error);
    res.status(500).json({ message: "تأكد من اتصالك بالانترنت" });
  }
};
