import Students from "../models/student.js";
import complaint from "../models/complaint.js";
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

    if (points_to_add) {
      The_Student.points += Number(points_to_add);
      await The_Student.save();
    }

    // إرسال إشعار للطالب
    await fetch("https://exams-back.onrender.com/notify-student", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_ID: student_ID,
        title: "تمت الإستجابة للشكوى",
        body: our_notes ? ` ${our_notes}` : "شكرا لتنبيهنا",
      }),
    });

    await The_Complaint.deleteOne();

    res.status(200).json({ message: "تمت الاستجابة وإرسال الإشعار" });
  } catch (error) {
    res.status(500).json({ message: "تحقق من اتصالك بالانترنت" });
  }
};
