import Request from "../models/request.js";
import Exams from "../models/exam.js";
import dotenv from "dotenv";
dotenv.config();

export const Accept_Request = async (req, res) => {
  try {
    const { _id, PASSWORD, our_notes } = req.body;

    if (!_id || !PASSWORD || PASSWORD !== process.env.PASSWORD) {
      return res.status(401).json({ message: "تعذر قبول الطلب" });
    }

    const The_Request = await Request.findById(_id);
    if (!The_Request) {
      return res.status(404).json({ message: "الطلب غير موجود" });
    }

    // أضف student_ID لمصفوفة available_to في كل اختبار
    await Exams.updateMany(
      { _id: { $in: The_Request.exams_ids } },
      { $addToSet: { available_to: The_Request.student_ID } },
    );

    // حدّث حالة الطلب
    The_Request.status = "accepted";
    The_Request.our_notes = our_notes || "";
    await The_Request.save();

    return res
      .status(200)
      .json({ message: "تم قبول الطلب وتسجيل الطالب في المواد" });
  } catch (err) {
    return res.status(500).json("حدث خطأ في الخادم.");
  }
};
