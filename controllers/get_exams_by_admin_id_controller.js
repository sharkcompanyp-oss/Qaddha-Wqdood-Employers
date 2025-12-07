import Subject from "../models/exam.js";
import dotenv from "dotenv";
dotenv.config();

export const Get_Exams_By_Admin_Id = async (req, res) => {
  try {
    const { _id, search_term, PASSWORD } = req.body;

    // التحقق من كلمة المرور
    if (!PASSWORD || PASSWORD !== process.env.PASSWORD) {
      return res.status(401).json({ message: "تعذر جلب الاختبار" });
    }

    // التحقق من وجود `_id`
    if (!_id) {
      return res.status(400).json({ message: "معرّف الأدمن غير موجود" });
    }

    // بناء الفلتر
    const filter = { admin_id: _id };

    // إضافة البحث بالاسم إذا موجود
    if (search_term && search_term.trim() !== "") {
      filter.name = new RegExp(search_term, "i");
    }

    const exams = await Subject.find(filter);
    if (!exams) {
      return req
        .status(404)
        .json({ message: "لم تقم بإنشاء أي اختبار حتى الآن" });
    }
    return res.json(exams);
  } catch (err) {
    return res.status(500).json({ message: "حدث خطأ في الخادم" });
  }
};
