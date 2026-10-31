import Refund from "../models/refund.js";
import Exams from "../models/exam.js";
import Students from "../models/student.js";
import { isPanel } from "../services/access.js";

// ─── المرتجعات ────────────────────────────────────────────────────────────────
// للوحة وحدها. المرتجع لطالبٍ مشترك في خطة «معدل» للمادة حصراً، ومبلغه سعر
// المعدل يوم الإرجاع.

const panelOnly = (req, res) => {
  if (isPanel(req)) return true;
  res.status(401).json({ message: "غير مصرّح" });
  return false;
};

// الرقم الجامعي مخزَّنٌ في القوائم رقماً أحياناً ونصاً أحياناً
const idForms = (ID) => {
  const s = String(ID);
  const n = Number(ID);
  return Number.isFinite(n) ? [s, n] : [s];
};

/**
 * مواد الطالب في خطة معدل ومرتجعاته.
 * body: { PASSWORD, student_oid }
 * الردّ: { subjects:[{_id,name,price_moadal,refunded}], refunds:[…] }
 */
export const Refunds_Student = async (req, res) => {
  try {
    if (!panelOnly(req, res)) return;
    const student = await Students.findById(String(req.body?.student_oid || ""))
      .select("ID name")
      .lean();
    if (!student) return res.status(404).json({ message: "الطالب غير موجود" });

    const [subjects, refunds] = await Promise.all([
      Exams.find({ available_to_moadal: { $in: idForms(student.ID) } })
        .select("name ID price_moadal")
        .lean(),
      Refund.find({ student_ID: String(student.ID) }).sort({ created_at: -1 }).lean(),
    ]);
    const refunded = new Set(refunds.map((r) => r.exam_id));
    return res.status(200).json({
      subjects: subjects.map((s) => ({
        _id: String(s._id),
        name: s.name,
        code: s.ID,
        price_moadal: s.price_moadal || 0,
        refunded: refunded.has(String(s._id)),
      })),
      refunds,
    });
  } catch (error) {
    console.error("Refunds_Student:", error.message);
    return res.status(500).json({ message: "تعذّر جلب المرتجعات" });
  }
};

/** body: { PASSWORD, student_oid, exam_id, note? } */
export const Refunds_Add = async (req, res) => {
  try {
    if (!panelOnly(req, res)) return;
    const { student_oid, exam_id, note } = req.body || {};
    const student = await Students.findById(String(student_oid || "")).select("ID name").lean();
    if (!student) return res.status(404).json({ message: "الطالب غير موجود" });

    const exam = await Exams.findOne({
      _id: String(exam_id || ""),
      available_to_moadal: { $in: idForms(student.ID) },
    })
      .select("name price_moadal")
      .lean();
    if (!exam) {
      return res.status(400).json({ message: "الطالب غير مشترك في خطة معدل لهذه المادة" });
    }

    const refund = await Refund.create({
      exam_id: String(exam._id),
      exam_name: exam.name || "",
      student_oid: String(student._id),
      student_ID: String(student.ID),
      student_name: student.name || "",
      amount: Number(exam.price_moadal) || 0,
      note: String(note || "").trim().slice(0, 500),
    });
    return res.status(200).json({ refund });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "سُجّل مرتجعٌ لهذا الطالب في هذه المادة من قبل" });
    }
    console.error("Refunds_Add:", error.message);
    return res.status(500).json({ message: "تعذّر حفظ المرتجع" });
  }
};

/** body: { PASSWORD, refund_id } — تراجعٌ عن مرتجعٍ سُجّل خطأً */
export const Refunds_Delete = async (req, res) => {
  try {
    if (!panelOnly(req, res)) return;
    await Refund.deleteOne({ _id: String(req.body?.refund_id || "") });
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Refunds_Delete:", error.message);
    return res.status(500).json({ message: "تعذّر الحذف" });
  }
};
