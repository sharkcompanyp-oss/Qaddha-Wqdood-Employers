import Students from "../models/student.js";
import complaint from "../models/complaint.js";
import PointsLedger from "../models/points_ledger.js";
import dotenv from "dotenv";

dotenv.config();

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const Responde_To_Complaint = async (req, res) => {
  try {
    const { complaint_id, student_ID, our_notes, points_to_add } = req.body;

    if (!complaint_id || !student_ID) {
      return res.status(400).json({ message: "البيانات ناقصة" });
    }

    const The_Complaint = await complaint.findById(complaint_id);
    const The_Student = await Students.findOne({ ID: student_ID });

    // بعد الجلب لازم تتحقق
    if (!The_Complaint)
      return res.status(404).json({ message: "الشكوى غير موجودة" });
    if (!The_Student)
      return res.status(404).json({ message: "الطالب غير موجود" });

    if (points_to_add) {
      The_Student.points += Number(points_to_add);
      await The_Student.save();

      // تسجيل الحركة في دفتر النقاط (شكوى صحيحة = 30 حسب دليل النقاط)
      try {
        await PointsLedger.create({
          student_ID: String(student_ID),
          delta: Number(points_to_add),
          reason_code: "complaint_valid",
          note: "شكوى صحيحة عن خطأ علمي/إملائي",
          source_type: "complaint",
          source_id: String(complaint_id),
        });
      } catch (ledgerErr) {
        console.error("فشل تسجيل حركة النقاط:", ledgerErr);
      }
    }

    // إرسال إشعار للطالب
    const EXAMS_BACKEND_URL =
      process.env.EXAMS_BACKEND_URL || "https://exams-back.onrender.com";
    await fetch(`${EXAMS_BACKEND_URL}/notify-student`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_ID: student_ID,
        title: "تمت الإستجابة للشكوى",
        body: our_notes ? ` ${our_notes}` : "شكرا لتنبيهنا",
        INTERNAL_SECRET: process.env.INTERNAL_SECRET, // ✅ من .env مو hardcoded
      }),
    });

    await The_Complaint.deleteOne();

    res.status(200).json({ message: "تمت الاستجابة وإرسال الإشعار" });
  } catch (error) {
    res.status(500).json({ message: "تحقق من اتصالك بالانترنت" });
  }
};
