import Request from "../models/request.js";
import Exam from "../models/exam.js";
import dotenv from "dotenv";
dotenv.config();

export const Accept_Request = async (req, res) => {
  try {
    const { _id, PASSWORD } = req.body;

    // التحقق من البيانات
    if (!_id || !PASSWORD || PASSWORD !== process.env.PASSWORD) {
      return res.status(401).json({ message: "تعذر قبول الطلب" });
    }

    // جلب الطلب
    const The_Request = await Request.findById(_id);
    if (!The_Request) {
      return res.status(404).json({ message: "الطلب غير موجود" });
    }

    // جلب آخر ID (مرتّب)
    const Last_Exam = await Exam.findOne().sort({ ID: -1 }).lean();
    const New_ID = Last_Exam ? Number(Last_Exam.ID) + 1 : 1;

    // إنشاء الاختبار الجديد
    const The_New_Exam = new Exam({
      name: The_Request.name,
      ID: String(New_ID),
      college_id: The_Request.college_id,
      info: The_Request.info,
      questions: The_Request.questions,
      time: The_Request.time,
      visible: false,
      available_to: [],
      open_mode: false,
      price: The_Request.price || 0,
      admin_id: The_Request.admin_id || null,
    });

    await The_New_Exam.save();
    await The_Request.deleteOne();

    return res.status(200).json({ message: "تم قبول الطلب وإضافة الاختبار" });
  } catch (err) {
    return res.status(500).json("حدث خطأ في الخادم.");
  }
};
