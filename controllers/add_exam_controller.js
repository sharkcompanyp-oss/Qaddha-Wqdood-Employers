import Exams from "../models/exam.js";

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const Add_Exam = async (req, res) => {
  try {
    const {
      name,
      college_id,
      info,
      questions,
      visible,
      price,
      price_moadal,
      admin_id,
      summary,
    } = req.body;

    // ── المادة تُنشأ فارغة ──
    // كان الشرط يطلب `questions` غير فارغة، وهو من الهيكل القديم حين كانت
    // الأسئلة على مستوى المادة. صارت داخل كل محاضرة، فالمادة الجديدة تُولد
    // بحقولها وحدها وتُملأ محاضرةً محاضرة — واشتراط سؤالٍ هنا كان يمنع
    // إنشاءها أصلاً، أو يدفع إلى حشو سؤالٍ وهميّ في حقلٍ ميت.
    if (!name || !college_id) {
      return res.status(400).json({
        error: "الحقول المطلوبة: name, college_id",
      });
    }

    // جلب آخر ID (مرتّب)
    const Last_Exam = await Exams.findOne().sort({ ID: -1 }).lean();
    const New_ID = Last_Exam ? Number(Last_Exam.ID) + 1 : 1;

    // إنشاء المادة الجديد
    const The_New_Exam = new Exams({
      name,
      ID: String(New_ID),
      college_id,
      info: info || "",
      questions: Array.isArray(questions) ? questions : [],
      visible: visible ?? false,
      available_to: [],
      open_mode: true,
      price: price || 0,
      price_moadal: price_moadal || 0,
      admin_id: admin_id || null,
      summary: summary || null,
    });

    await The_New_Exam.save();

    // نعيد `_id` أيضاً: الواجهة تفتح مساحة العمل على المادة فور إنشائها،
    // وهي تحتاج معرّف المستند لا الرقم التسلسلي.
    res.status(201).json({
      message: "تمت إضافة المادة بنجاح",
      exam_id: String(New_ID),
      _id: String(The_New_Exam._id),
    });
  } catch (error) {
    console.error("خطأ في إضافة المادة:", error);

    // معالجة أخطاء MongoDB المحددة
    if (error.name === "ValidationError") {
      return res.status(400).json({
        error: "خطأ في التحقق من البيانات",
        details: error.message,
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        error: "المادة موجود مسبقاً",
      });
    }

    res.status(500).json({
      error: "حدث خطأ في الخادم",
    });
  }
};
