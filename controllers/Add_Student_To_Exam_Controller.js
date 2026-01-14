import Subjects from "../models/exam.js";
import Admin from "../models/admin.js";

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const Add_Student_To_Exam = async (req, res) => {
  try {
    const { STUDENT_ID, EXAM_ID, is_free } = req.body;

    // التحقق من البيانات
    if (!STUDENT_ID || !EXAM_ID || STUDENT_ID.trim() === "") {
      return res.status(400).json({ message: "البيانات ناقصة" });
    }

    // جلب الامتحان
    const The_Exam = await Subjects.findOne({ _id: EXAM_ID });
    if (!The_Exam) {
      return res.status(404).json({ message: "الاختبار غير موجود" });
    }

    // ✅ حالة خاصة: تصفية كل المشتركين
    if (STUDENT_ID == "0000") {
      The_Exam.available_to = [];
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

    // التحقق من وجود الطالب مسبقاً
    const studentExists = The_Exam.available_to.includes(String(STUDENT_ID));
    if (studentExists) {
      return res.status(400).json({
        message: "الطالب مضاف بالفعل لهذا الاختبار",
      });
    }

    // إضافة الطالب للامتحان
    The_Exam.available_to.push(String(STUDENT_ID));

    // ✅ تحديث عدد الاشتراكات المجانية
    if (is_free) {
      The_Exam.number_of_free_subscriptions += 1;
    }

    // ✅ تحديث الأرباح (فقط للاشتراكات المدفوعة)
    if (!is_free && The_Exam.price > 0) {
      The_Exam.total_profit += Number(The_Exam.price);

      // إضافة أرباح الأدمن
      if (The_Exam.admin_id) {
        const admin = await Admin.findOne({ _id: The_Exam.admin_id });
        if (admin) {
          admin.total_profit += The_Exam.price;
          await admin.save();
          console.log(
            `✅ تم إضافة ${The_Exam.price} ل.س لأرباح الأدمن ${admin.name}`
          );
        } else {
          console.warn(
            `⚠️ لم يتم العثور على الأدمن بـ ID: ${The_Exam.admin_id}`
          );
        }
      }
    }

    await The_Exam.save();

    return res.status(200).json({
      message: is_free
        ? "تمت إضافة الطالب مجاناً بنجاح"
        : "تمت إضافة الطالب بنجاح",
      exam: {
        name: The_Exam.name,
        price: The_Exam.price,
        studentsCount: The_Exam.available_to.length,
        freeSubscriptions: The_Exam.number_of_free_subscriptions,
      },
    });
  } catch (error) {
    console.error("Error in Add_Student_To_Exam:", error);
    return res.status(500).json({ message: "تحقق من اتصالك بالانترنت" });
  }
};
