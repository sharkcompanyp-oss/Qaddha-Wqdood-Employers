import Exams from "../models/exam.js";
import Admins from "../models/admin.js"; // تأكد من الاسم الصحيح
import dotenv from "dotenv";

dotenv.config();

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const Update_Exam = async (req, res) => {
  try {
    const {
      _id,
      new_name,
      new_info,
      new_questions,
      new_time,
      new_visible,
      new_available_to,
      new_open_mode,
      new_price,
    } = req.body;

    if (!_id) {
      return res.status(400).json({ message: "رمز المادة ناقص" });
    }
    const The_Exam = await Exams.findOne({
      _id: _id,
    });
    if (!The_Exam) {
      return res.status(404).json({ message: "الاختبار غير موجود" });
    }

    const clean_new_available_to = Array.isArray(new_available_to)
      ? new_available_to.filter(
          (x) => x !== null && x !== undefined && x !== ""
        )
      : [];

    const clean_old_available_to = The_Exam.available_to.filter(
      (x) => x !== null && x !== undefined && x !== ""
    );

    // حساب عدد الطلاب قبل وبعد
    const old_count = clean_old_available_to.length;
    const new_count = clean_new_available_to.length;

    // حساب الفرق
    const difference = new_count - old_count;

    let profit_to_add = 0;
    if (difference > 0) {
      profit_to_add = difference * new_price;
    }

    // الحصول على الأدمن
    const admin = await Admins.findById(The_Exam.admin_id);
    if (!admin) {
      return res.status(404).json({ message: "الأدمن غير موجود" });
    }

    // إضافة الربح
    admin.total_profit += profit_to_add;
    await admin.save();

    // تحديث بيانات الاختبار
    The_Exam.name = new_name;
    The_Exam.info = new_info;
    The_Exam.questions = new_questions;
    The_Exam.time = new_time;
    The_Exam.visible = new_visible;
    The_Exam.available_to = clean_new_available_to;
    The_Exam.open_mode = new_open_mode;
    The_Exam.price = new_price;

    await The_Exam.save();

    res.status(200).json({
      message: "تم تحديث بيانات الاختبار",
      profit_added: profit_to_add,
      old_count,
      new_count,
    });
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ message: "تحقق من اتصالك بالانترنت", error: error.message });
  }
};
