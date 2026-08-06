import Request from "../models/request.js";
import Subjects from "../models/exam.js";
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

    // كل المواد تدخل «ترفيع»؛ ومواد «معدل» تدخل القائمتين (معدل تشمل ترفيع)
    await Subjects.updateMany(
      { _id: { $in: The_Request.exams_ids } },
      { $addToSet: { available_to: The_Request.student_ID } },
    );

    const moadalIds = (The_Request.tiers || [])
      .filter((t) => t.tier === "moadal")
      .map((t) => String(t.exam_id));
    if (moadalIds.length > 0) {
      await Subjects.updateMany(
        { _id: { $in: moadalIds } },
        { $addToSet: { available_to_moadal: The_Request.student_ID } },
      );
    }

    The_Request.status = "accepted";
    The_Request.our_notes = our_notes || "";
    await The_Request.save();

    // إبلاغ باك اند الطلاب: بث فوري بالسوكيت (إن كان التطبيق مفتوحاً) + إشعار FCM
    const EXAMS_BACKEND_URL =
      process.env.EXAMS_BACKEND_URL || "https://exams-back.onrender.com";
    try {
      await fetch(`${EXAMS_BACKEND_URL}/internal/request-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_ID: The_Request.student_ID,
          status: "accepted",
          exams_ids: The_Request.exams_ids,
          title: "✅ تم القبول بنجاح",
          body: our_notes
            ? ` ${our_notes}`
            : "أهلا وسهلا بك, يمكنك الآن الدخول لموادك",
          INTERNAL_SECRET: process.env.INTERNAL_SECRET,
        }),
      });
    } catch (notifyErr) {
      // فشل التبليغ لا يلغي القبول — الطالب سيرى المادة عند أول تحديث
      console.error("فشل تبليغ باك اند الطلاب بالقبول:", notifyErr);
    }

    return res
      .status(200)
      .json({ message: "تم قبول الطلب وتسجيل الطالب في المواد" });
  } catch (err) {
    return res.status(500).json("حدث خطأ في الخادم.");
  }
};
