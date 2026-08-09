import Students from "../models/student.js";
import Subjects from "../models/exam.js";
import { purgeAllPlansOfStudent } from "../services/purge_plans.js";

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const Delete_Student = async (req, res) => {
  try {
    const { name, ID } = req.body;
    const The_Student = await Students.findOne({ ID: ID, name: name });

    // الطالب غير موجود كان يرمي على `null.deleteOne()` فيعود «تحقق من
    // اتصالك بالانترنت» — رسالة تكذب على المستخدم وتُخفي السبب الحقيقي.
    if (!The_Student) {
      return res.status(404).json({ message: "الطالب غير موجود" });
    }

    const sid = String(The_Student.ID);
    await The_Student.deleteOne();

    // طالب محذوف لم يعد مسجَّلاً في شيء: يُرفع من كل المواد وتُحذف خططه.
    // بقاء رقمه في `available_to` كان يُبقيه محسوباً في عدد المشتركين
    // وفي أرباح المادة، ويمنح الوصول لأي حساب يُنشأ لاحقاً بنفس الرقم.
    try {
      await Subjects.updateMany(
        {
          $or: [{ available_to: sid }, { available_to_moadal: sid }],
        },
        { $pull: { available_to: sid, available_to_moadal: sid } },
      );
      await purgeAllPlansOfStudent(sid);
    } catch (cleanupErr) {
      console.error("فشل تنظيف تسجيلات الطالب المحذوف:", cleanupErr);
    }

    res.status(200).json({ message: "تم حذف الطالب" });
  } catch (error) {
    console.error("Delete_Student:", error);
    res.status(500).json({ message: "تحقق من اتصالك بالانترنت" });
  }
};
