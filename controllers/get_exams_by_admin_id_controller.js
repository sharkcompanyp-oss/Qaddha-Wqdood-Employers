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

    // بناء الفلتر الأساسي: admin_id
    const filter = { admin_id: _id };

    // إضافة فلترة البحث إذا وجدت
    if (search_term && search_term !== "") {
      const regex = new RegExp(search_term, "i");

      filter.$or = [
        { name: regex },
        { ID: !isNaN(search_term) ? Number(search_term) : undefined },
      ];
    }

    // إزالة أي شرط undefined داخل $or
    if (filter.$or) {
      filter.$or = filter.$or.filter(
        (cond) => !Object.values(cond).includes(undefined)
      );
      if (filter.$or.length === 0) delete filter.$or;
    }

    const exams = await Subject.find(filter);
    return res.json(exams);
  } catch (err) {
    return res.status(500).json("حدث خطأ في الخادم.");
  }
};
