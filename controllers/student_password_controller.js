import bcrypt from "bcryptjs";
import Students from "../models/student.js";
import { isPanel } from "../services/access.js";

// ─── كلمة مرور الطالب ─────────────────────────────────────────────────────────
// تطبيق الطلاب (EXAMS/backend/controllers/Auth_Controller.js) يحفظ الكلمة
// مشفّرةً بـbcrypt بكلفة 10 ويتحقّق منها بـbcrypt.compare. نشفّر هنا بالطريقة
// نفسها (bcryptjs يُخرج تشفيراً تقبله مكتبة bcrypt هناك — جُرّب) فيدخل الطالب
// بالكلمة الجديدة مباشرةً.
//
// لا تُحفظ الكلمة الصريحة ولا تُطبع. الجلسات المفتوحة على أجهزة الطالب تبقى
// صالحة (توكنها لا يتعلّق بالكلمة) — الكلمة الجديدة لأي دخولٍ قادم.

/** body: { PASSWORD, student_oid, new_password } */
export const Student_Set_Password = async (req, res) => {
  try {
    if (!isPanel(req)) return res.status(401).json({ message: "غير مصرّح" });
    const { student_oid, new_password } = req.body || {};
    const pw = String(new_password ?? "");
    if (!pw.trim()) return res.status(400).json({ message: "كلمة المرور فارغة" });
    if (pw.length > 72) {
      // bcrypt يقرأ أول 72 بايتاً فقط — الأطول يُقبل بنصفه دون أن يدري أحد
      return res.status(400).json({ message: "كلمة المرور أطول من المسموح" });
    }
    const hash = await bcrypt.hash(pw, 10);
    const r = await Students.updateOne({ _id: String(student_oid || "") }, { $set: { password: hash } });
    if (!r.matchedCount) return res.status(404).json({ message: "الطالب غير موجود" });
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Student_Set_Password:", error.message);
    return res.status(500).json({ message: "تعذّر تغيير كلمة المرور" });
  }
};
