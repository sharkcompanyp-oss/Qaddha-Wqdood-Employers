import Students from "../models/student.js";
import dotenv from "dotenv";
dotenv.config();

export const Get_Students = async (req, res) => {
  try {
    console.log("✅ Route hit");
    console.log("📦 req.body:", req.body);

    const { searchTerm, PASSWORD } = req.body;

    console.log("🔑 PASSWORD received:", PASSWORD);
    console.log("🔑 PASSWORD env:", process.env.PASSWORD);
    console.log("🔍 searchTerm:", searchTerm);

    if (!PASSWORD || PASSWORD !== process.env.PASSWORD) {
      console.log("❌ Password mismatch or missing");
      return res.status(401).json({ message: "تعذر جلب الطالب" });
    }

    console.log("✅ Password OK");

    let students;

    if (searchTerm) {
      console.log("🔍 Searching for:", searchTerm);
      const regex = new RegExp(searchTerm, "i");
      students = await Students.find({
        $or: [{ name: regex }, { ID: searchTerm }],
      });
    } else {
      console.log("📋 Fetching all students");
      students = await Students.find();
    }

    console.log("✅ Students found:", students.length);
    res.json(students);
  } catch (error) {
    console.error("💥 Get Students Error:", error);
    res.status(500).json({ message: "تأكد من اتصالك بالانترنت" });
  }
};
