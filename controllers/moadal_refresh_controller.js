import Exams from "../models/exam.js";
import { recomputeMoadalAvailability } from "../services/moadal_eligibility.js";

// ─── إعادة حساب أهلية «معدل» ──────────────────────────────────────────────────
// المواد المحفوظة تحمل قيمةً حُسبت بالتعريف القديم، ولا تُصحَّح إلا عند أوّل
// حفظٍ لاحق. هذا المسار يعيد الحساب دفعةً واحدة بلا فتح كل مادة وحفظها.
//
// آمنٌ للتكرار: لا يكتب إلا ما تغيّر فعلاً.

const guard = (req, res) => {
  const { PASSWORD } = req.body || {};
  if (!PASSWORD || PASSWORD !== process.env.PASSWORD) {
    res.status(401).json({ message: "غير مصرّح" });
    return false;
  }
  return true;
};

export const Refresh_Moadal = async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const { _id } = req.body || {};
    const filter = _id ? { _id } : {};
    const exams = await Exams.find(filter).select(
      "name lectures moadal_available",
    );

    const changed = [];
    for (const exam of exams) {
      const r = recomputeMoadalAvailability(exam);
      if (r.changed) {
        // eslint-disable-next-line no-await-in-loop
        await exam.save();
        changed.push({
          _id: String(exam._id),
          name: exam.name,
          was: r.was,
          now: r.now,
          missing: r.missing,
        });
      }
    }

    return res.status(200).json({
      message: changed.length
        ? `تغيّرت أهلية ${changed.length} مادة`
        : "لا تغيير — الأهلية محسوبة أصلاً",
      scanned: exams.length,
      changed,
    });
  } catch (e) {
    console.error("Refresh_Moadal:", e);
    return res
      .status(500)
      .json({ message: "تعذّرت إعادة الحساب", error: e.message });
  }
};
