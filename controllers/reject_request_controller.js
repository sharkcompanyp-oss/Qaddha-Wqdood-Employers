import Request from "../models/request.js";
import dotenv from "dotenv";
dotenv.config();

export const Reject_Request = async (req, res) => {
  try {
    const { _id, PASSWORD } = req.body;

    // التحقق من كلمة المرور
    if (!PASSWORD || PASSWORD !== process.env.PASSWORD) {
      return res.status(401).json({ message: "تعذر رفض الطلب" });
    }

    // التحقق من وجود _id
    if (!_id) {
      return res.status(400).json({ message: "الرجاء إرسال _id" });
    }

    // البحث عن الطلب
    const The_Request = await Request.findById(_id);

    if (!The_Request) {
      return res.status(404).json({ message: "الطلب محذوف بالفعل" });
    }

    // الحذف
    await The_Request.deleteOne();

    return res.status(200).json({ message: "تم الرفض بنجاح" });
  } catch (err) {
    return res.status(500).json("حدث خطأ في الخادم.");
  }
};
