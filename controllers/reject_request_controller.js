import Request from "../models/request.js";
import { callExamsBackend } from "../config/exams_backend.js";
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

    // إبلاغ باك اند الطلاب: بث فوري بالسوكيت + إشعار FCM
    const notified = await callExamsBackend(
      "/internal/request-status",
      {
        student_ID: The_Request.student_ID,
        status: "rejected",
        exams_ids: The_Request.exams_ids,
        title: "❌ تم رفض الطلب",
        body: our_notes
          ? `سبب الرفض : ${our_notes}`
          : "للأسف تم رفض طلب التسجيل",
      },
      "تبليغ الرفض",
    );

    return res.status(200).json({
      message: notified.ok
        ? "تم الرفض بنجاح"
        : "تم الرفض، لكن تعذّر إبلاغ الطالب (لن يصله إشعار فوري)",
      notified: notified.ok,
    });
  } catch (err) {
    return res.status(500).json("حدث خطأ في الخادم.");
  }
};
