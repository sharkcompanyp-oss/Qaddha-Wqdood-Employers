import Exams from "../models/exam.js";
import Admin from "../models/Admin.js";
/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const Update_Exam = async (req, res) => {
  try {
    const {
      ID,
      new_id,
      new_name,
      new_info,
      new_questions,
      new_time,
      new_visible,
      new_available_to,
      new_open_mode,
      new_price,
    } = req.body;
    const The_Exam = await Exams.findOne({ ID: ID });
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

    const The_New_Subscribers =
      Number(clean_new_available_to.length) -
      Number(clean_old_available_to.length);

    if (The_New_Subscribers > 0) {
      const The_Admin = await Admin.findOne();
      if (!The_Admin) {
        return res.status(500).json({ message: "حساب الأدمن غير موجود" });
      }
      The_Admin.total_profit += The_New_Subscribers * Number(new_price);

      const existingProfit = The_Admin.profits.find(
        (profit) => profit.subject_id === ID
      );

      if (!existingProfit) {
        The_Admin.profits.push({
          subject_id: ID,
          price: new_price,
          subscribers: clean_new_available_to.length,
        });
      } else {
        existingProfit.price = new_price;
        existingProfit.subscribers = clean_new_available_to.length;
      }

      await The_Admin.save();
    }

    The_Exam.ID = new_id;
    The_Exam.name = new_name;
    The_Exam.info = new_info;
    The_Exam.questions = new_questions;
    The_Exam.time = new_time;
    The_Exam.visible = new_visible;
    The_Exam.available_to = clean_new_available_to;
    The_Exam.open_mode = new_open_mode;
    The_Exam.price = new_price;
    await The_Exam.save();
    res.status(200).json({ message: "تم تحديث بيانات الاختبار" });
  } catch (error) {
    res.status(500).json({ message: "تحقق من اتصالك بالانترنت" });
  }
};
