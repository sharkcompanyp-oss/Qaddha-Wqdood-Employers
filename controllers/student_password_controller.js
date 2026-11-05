import Students from "../models/student.js";
import { isPanel } from "../services/access.js";

// ─── كلمة مرور الطالب ─────────────────────────────────────────────────────────
// تُحفظ صريحةً بلا تشفير (لا بيانات حسّاسة للطالب، والمطلوب أن يدخل بما
// يُعطى له حرفياً). تطبيق الطلاب (EXAMS/backend/controllers/Auth_Controller.js)
// يقبل النوعين: المشفّرة بـbcrypt (تبدأ بـ$2) تُقارن بـbcrypt، والصريحة بالمساواة.
//
// بعد الحفظ تُقرأ الوثيقة ثانيةً ويُتأكَّد أن الكلمة فيها هي المكتوبة — فإن
// قال الردّ «تغيّرت» فهي في القاعدة فعلاً. الجلسات المفتوحة تبقى صالحة.

/** body: { PASSWORD, student_oid, new_password } */
export const Student_Set_Password = async (req, res) => {
  try {
    if (!isPanel(req)) return res.status(401).json({ message: "غير مصرّح" });
    const { student_oid, new_password } = req.body || {};
    const pw = String(new_password ?? "");
    if (!pw.trim()) return res.status(400).json({ message: "كلمة المرور فارغة" });
    if (/^\$2[aby]\$/.test(pw)) {
      // تُشبه كلمةً مشفّرة فيقارنها التطبيق بـbcrypt ولن تُقبل أبداً
      return res.status(400).json({ message: "كلمة المرور لا تبدأ بـ $2" });
    }
    const r = await Students.updateOne({ _id: String(student_oid || "") }, { $set: { password: pw } });
    if (!r.matchedCount) return res.status(404).json({ message: "الطالب غير موجود" });

    const check = await Students.findById(String(student_oid)).select("password ID").lean();
    if (check?.password !== pw) {
      return res.status(500).json({ message: "لم تُحفظ الكلمة كما كُتبت — أعد المحاولة" });
    }
    return res.status(200).json({ ok: true, ID: check.ID });
  } catch (error) {
    console.error("Student_Set_Password:", error.message);
    return res.status(500).json({ message: "تعذّر تغيير كلمة المرور" });
  }
};
