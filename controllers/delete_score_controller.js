import Students from "../models/student.js";

export const Delete_Score = async (req, res) => {
  try {
    const { score, ID, index } = req.body;

    const The_Student = await Students.findOne({ ID });
    if (!The_Student) {
      return res.status(404).json({ message: "الطالب غير موجود" });
    }

    // حذف العنصر حسب الـ index
    The_Student.scores.splice(index, 1);

    await The_Student.save();

    res.status(200).json({ message: "تم حذف النتيجة بنجاح", score, index });
  } catch (error) {
    console.error("Delete_Score Error:", error);
    res.status(500).json({ message: "حدث خطأ أثناء حذف النتيجة" });
  }
};
