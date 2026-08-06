import Subjects from "../models/exam.js";
import Admin from "../models/admin.js";

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const Add_Student_To_Exam = async (req, res) => {
  try {
    const { STUDENT_ID, EXAM_ID, is_free, is_moadal } = req.body;

    // التحقق من البيانات
    if (!STUDENT_ID || !EXAM_ID || STUDENT_ID.trim() === "") {
      return res.status(400).json({ message: "البيانات ناقصة" });
    }

    // جلب الامتحان
    const The_Exam = await Subjects.findOne({ _id: EXAM_ID });
    if (!The_Exam) {
      return res.status(404).json({ message: "المادة غير موجود" });
    }

    // ✅ حالة خاصة: تصفية كل المشتركين
    if (STUDENT_ID == "0000") {
      The_Exam.available_to = [];
      The_Exam.available_to_moadal = [];
      The_Exam.number_of_free_subscriptions = 0;
      await The_Exam.save();

      return res.status(200).json({
        message: "تم تصفية جميع المشتركين بنجاح",
        exam: {
          name: The_Exam.name,
          studentsCount: 0,
        },
      });
    }

    const sid = String(STUDENT_ID);
    const inTarfee = The_Exam.available_to.includes(sid);
    const inMoadal = (The_Exam.available_to_moadal || []).includes(sid);

    // معدل تشمل ترفيع: الطالب يضاف للقائمتين. الرفض فقط إن كان في القائمة الهدف
    if (is_moadal ? inMoadal : inTarfee) {
      return res.status(400).json({
        message: is_moadal
          ? "الطالب مشترك بمعدل بالفعل في هذه المادة"
          : "الطالب مضاف بالفعل لهذا المادة",
      });
    }

    // إضافة الطالب
    if (!inTarfee) The_Exam.available_to.push(sid);
    if (is_moadal && !inMoadal) {
      if (!Array.isArray(The_Exam.available_to_moadal)) {
        The_Exam.available_to_moadal = [];
      }
      The_Exam.available_to_moadal.push(sid);
    }

    // ✅ تحديث عدد الاشتراكات المجانية
    if (is_free) {
      The_Exam.number_of_free_subscriptions += 1;
    }

    // ✅ تحديث الأرباح (فقط للاشتراكات المدفوعة) — معدل بسعرها
    const effective_price = is_moadal
      ? Number(The_Exam.price_moadal) || 0
      : Number(The_Exam.price) || 0;
    if (!is_free && effective_price > 0) {
      The_Exam.total_profit += effective_price;

      // إضافة أرباح الأدمن
      if (The_Exam.admin_id) {
        const admin = await Admin.findOne({ _id: The_Exam.admin_id });
        if (admin) {
          admin.total_profit += effective_price;
          await admin.save();
          console.log(
            `✅ تم إضافة ${effective_price} ل.س لأرباح الأدمن ${admin.name}`,
          );
        } else {
          console.warn(
            `⚠️ لم يتم العثور على الأدمن بـ ID: ${The_Exam.admin_id}`,
          );
        }
      }
    }

    await The_Exam.save();

    return res.status(200).json({
      message: is_moadal
        ? "تمت إضافة الطالب باشتراك معدل بنجاح"
        : is_free
          ? "تمت إضافة الطالب مجاناً بنجاح"
          : "تمت إضافة الطالب بنجاح",
      exam: {
        name: The_Exam.name,
        price: The_Exam.price,
        studentsCount: (Array.isArray(The_Exam.available_to) ? The_Exam.available_to : []).length,
        freeSubscriptions: The_Exam.number_of_free_subscriptions,
      },
    });
  } catch (error) {
    console.error("Error in Add_Student_To_Exam:", error);
    return res.status(500).json({ message: "تحقق من اتصالك بالانترنت" });
  }
};
