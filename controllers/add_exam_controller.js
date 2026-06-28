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
      time,
      visible,
      price,
      admin_id,
      summary,
    } = req.body;

    // التحقق من الحقول المطلوبة
    if (!name || !college_id || !questions || !time) {
      return res.status(400).json({
        error: "الحقول المطلوبة: name, college_id, questions, time",
      });
    }

    // التحقق من صحة البيانات
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({
        error: "يجب أن تحتوي الأسئلة على عنصر واحد على الأقل",
      });
    }

    if (typeof time !== "number" || time <= 0) {
      return res.status(400).json({
        error: "الوقت يجب أن يكون رقماً موجباً",
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
      questions,
      time,
      visible: visible ?? false,
      available_to: [],
      open_mode: true,
      price: price || 0,
      admin_id: admin_id || null,
      summary: summary || null,
    });

    await The_New_Exam.save();

    res.status(201).json({
      message: "تمت إضافة المادة بنجاح",
      exam_id: String(New_ID),
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
