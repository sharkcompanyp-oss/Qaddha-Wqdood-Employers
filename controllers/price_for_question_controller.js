import Admins from "../models/admin.js";
import Exams from "../models/exam.js";
import { isPanel } from "../services/access.js";

export const set_price_for_question = async (req, res) => {
  try {
    // يعيد تسعير كل المواد دفعةً واحدة — كان مفتوحاً لأي أحد بلا تحقّق
    if (!isPanel(req)) return res.status(401).json({ message: "غير مصرّح" });
    const { _id, new_price } = req.body;

    if (!_id) {
      return res.status(400).json({ message: "رمز الأدمن ناقص" });
    }

    const The_Admin = await Admins.findOne({ _id: _id });

    if (!The_Admin) {
      return res.status(404).json({ message: "الأدمن غير موجود" });
    }

    // تحديث سعر السؤال للأدمن
    The_Admin.price_for_question = new_price;
    await The_Admin.save();

    // جلب كل الامتحانات
    const All_Exams = await Exams.find();

    // تحضير عمليات التحديث الجماعية
    const bulkOps = All_Exams.map((exam) => ({
      updateOne: {
        filter: { _id: exam._id },
        update: {
          $set: {
            price: Math.round(
              Number(new_price) * Number((Array.isArray(exam.questions) ? exam.questions : []).length),
            ),
          },
        },
      },
    }));

    // تنفيذ التحديث الجماعي
    const result = await Exams.bulkWrite(bulkOps);

    res.status(200).json({
      message: "تم تحديث سعر السؤال وأسعار الامتحانات بنجاح",
      updated_exams_count: result.modifiedCount,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: "تحقق من اتصالك بالانترنت",
      error: error.message,
    });
  }
};
