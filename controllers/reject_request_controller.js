import Request from "../models/request.js";
import dotenv from "dotenv";
dotenv.config();

export const Reject_Request = async (req, res) => {
  try {
    const { _id, PASSWORD, our_notes } = req.body;

    if (!PASSWORD || PASSWORD !== process.env.PASSWORD) {
      return res.status(401).json({ message: "تعذر رفض الطلب" });
    }

    if (!_id) {
      return res.status(400).json({ message: "الرجاء إرسال _id" });
    }

    const The_Request = await Request.findById(_id);
    if (!The_Request) {
      return res.status(404).json({ message: "الطلب محذوف" });
    }

    The_Request.our_notes = our_notes || "";
    The_Request.status = "rejected";
    await The_Request.save();

    // إرسال إشعار للطالب
    await fetch("https://exams-back.onrender.com/notify-student", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_ID: The_Request.student_ID,
        title: "❌ تم رفض طلبك",
        body: "للأسف تم رفض طلب التسجيل, اذهب إلى الإحصائيات لرؤية سبب الرفض",
      }),
    });

    return res.status(200).json({ message: "تم الرفض بنجاح" });
  } catch (err) {
    return res.status(500).json("حدث خطأ في الخادم.");
  }
};
