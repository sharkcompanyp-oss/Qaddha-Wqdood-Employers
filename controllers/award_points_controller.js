import Students from "../models/student.js";
import PointsLedger from "../models/points_ledger.js";
import { callExamsBackend } from "../config/exams_backend.js";
import dotenv from "dotenv";
dotenv.config();

// أكواد المنح المعتمدة وقيمها الثابتة (قرارات 2026-07-30) —
// السيرفر هو مصدر الحقيقة للقيم، لا الواجهة.
const AWARD_PRESETS = {
  note_approved: { delta: 10, label: "ملاحظة مقبولة في الملخص" },
  record_sent: { delta: 30, label: "إرسال ريكورد واضح" },
  full_course: { delta: 300, label: "إرسال دورة كاملة لدكتور المادة" },
  extra_lecture: { delta: 100, label: "محاضرة إضافية خارج المقرر" },
  complaint_valid: { delta: 30, label: "شكوى صحيحة عن خطأ علمي/إملائي" },
};

// نفس عتبات الشارات المعتمدة في باك اند الطلاب (Set_Badge_Controller)
const badgeForPoints = (points) => {
  if (points >= 10000) return "قدها وقدود";
  if (points >= 8000) return "كبير الحكماء";
  if (points >= 7000) return "صائد العلامات";
  if (points >= 6000) return "نيرد";
  if (points >= 5000) return "نخبة";
  if (points >= 4000) return "متفوق";
  if (points >= 3000) return "مميز";
  if (points >= 1000) return "مثابر";
  if (points >= 50) return "مبتدئ";
  return "فارش";
};

/**
 * منح نقاط لطالب: قيمة جاهزة بكود السبب، أو reason_code="manual" بقيمة حرة.
 * body: { PASSWORD, student_ID, reason_code, delta?, note?, admin_name? }
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const Award_Points = async (req, res) => {
  try {
    const { PASSWORD, student_ID, reason_code, delta, note, admin_name } =
      req.body;
    if (!PASSWORD || PASSWORD !== process.env.PASSWORD) {
      return res.status(401).json({ message: "غير مصرح" });
    }
    if (!student_ID || !reason_code) {
      return res.status(400).json({ message: "student_ID و reason_code مطلوبان" });
    }

    // القيمة: من الثوابت للأكواد الجاهزة، حرة فقط للكود manual
    let finalDelta;
    let reasonLabel;
    if (AWARD_PRESETS[reason_code]) {
      finalDelta = AWARD_PRESETS[reason_code].delta;
      reasonLabel = AWARD_PRESETS[reason_code].label;
    } else if (reason_code === "manual") {
      finalDelta = Number(delta);
      reasonLabel = note || "تعديل يدوي";
      if (!Number.isFinite(finalDelta) || finalDelta === 0) {
        return res
          .status(400)
          .json({ message: "قيمة النقاط غير صالحة للمنح اليدوي" });
      }
    } else {
      return res.status(400).json({ message: "كود سبب غير معروف" });
    }

    const The_Student = await Students.findOne({ ID: student_ID });
    if (!The_Student) {
      return res.status(404).json({ message: "الطالب غير موجود" });
    }

    // تحديث ذرّي للمجموع ثم الشارة
    const updated = await Students.findOneAndUpdate(
      { ID: student_ID },
      { $inc: { points: finalDelta } },
      { new: true },
    );
    updated.badge = badgeForPoints(updated.points);
    await updated.save();

    const entry = await PointsLedger.create({
      student_ID: String(student_ID),
      delta: finalDelta,
      reason_code,
      note: note || reasonLabel,
      source_type: "admin",
      admin_name: admin_name || "",
    });

    // إشعار الطالب بالمنحة وسببها (شفافية تمنع «ليش صاحبي أخذ ونسيتني»)
    await callExamsBackend(
      "/notify-student",
      {
        student_ID,
        title:
          finalDelta > 0
            ? `🎁 حصلت على ${finalDelta} نقطة`
            : `تعديل نقاط: ${finalDelta}`,
        body: `${reasonLabel} — رصيدك الآن ${updated.points} نقطة`,
      },
      "إشعار منح النقاط",
    );

    res.status(200).json({
      message: "تم منح النقاط",
      points: updated.points,
      badge: updated.badge,
      entry,
    });
  } catch (error) {
    console.error("Award_Points:", error);
    res.status(500).json({ message: "تعذر منح النقاط" });
  }
};

/**
 * سجل نقاط طالب (للوحة التحكم) — آخر 100 حركة.
 * body: { PASSWORD, student_ID }
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const Get_Student_Ledger = async (req, res) => {
  try {
    const { PASSWORD, student_ID } = req.body;
    if (!PASSWORD || PASSWORD !== process.env.PASSWORD) {
      return res.status(401).json({ message: "غير مصرح" });
    }
    if (!student_ID) {
      return res.status(400).json({ message: "student_ID مطلوب" });
    }
    const entries = await PointsLedger.find({ student_ID: String(student_ID) })
      .sort({ created_at: -1 })
      .limit(100)
      .lean();
    res.status(200).json(entries);
  } catch (error) {
    console.error("Get_Student_Ledger:", error);
    res.status(500).json({ message: "تعذر جلب السجل" });
  }
};
