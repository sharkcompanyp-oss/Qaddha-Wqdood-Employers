import Exams from "../models/exam.js";
import { isPanel } from "../services/access.js";
import { nextSubjectID } from "../services/subjectId.js";

// ─── استنساخ مادة إلى كلية أخرى ───────────────────────────────────────────────
// المادة نفسها لجامعةٍ أو كليةٍ أخرى: نسخةٌ مطابقة لكل ما فيها — المحاضرات
// بخاناتها الخمس، والسعران، والوصف، والظهور، والعضو المسؤول — بكلية مختلفة
// ورقمٍ تسلسليٍّ جديد.
//
// لا يُنسخ ما مصدره الطلاب لا المادة:
//   المشتركون (الخطتان)، وعدّادا الاشتراكات المجانية، والربح المتراكم،
//   وملاحظات الطلاب المكتوبة على أقسام الملخّص.
//
// النسخ في الخادم دفعةً واحدة: المادة وثيقةٌ واحدة قد تبلغ ميغابايتات، ونقلها
// إلى المتصفّح ثم إعادتها كان سيضاعف الحجم ويترك نسخةً ناقصة إن انقطع الاتصال.
//
// body: { PASSWORD, _id, college_id, force? }
//   force: تجاوز التحذير من مادةٍ بالاسم نفسه في الكلية الهدف.

const clearNotes = (sections) =>
  Array.isArray(sections) ? sections.map((s) => ({ ...s, notes: [] })) : sections;

export const Clone_Exam = async (req, res) => {
  try {
    // إنشاء مادة قرار اللوحة وحدها
    if (!isPanel(req)) return res.status(401).json({ message: "غير مصرّح" });

    const { _id, college_id, force } = req.body || {};
    const target = Number(college_id);
    if (!_id || !Number.isInteger(target) || target <= 0) {
      return res.status(400).json({ message: "المادة والكلية الهدف مطلوبتان" });
    }

    const src = await Exams.findById(_id).lean();
    if (!src) return res.status(404).json({ message: "المادة غير موجودة — ربما حُذفت" });

    if (Number(src.college_id) === target) {
      return res.status(400).json({
        message: "الكلية المختارة هي كلية المادة نفسها — اختر كليةً أخرى",
      });
    }

    // مادةٌ بالاسم نفسه في الكلية الهدف: غالباً استنساخٌ سابق أو ضغطةٌ مكرّرة.
    // نسأل بدل أن ننشئ نسخةً ثانية بصمت.
    if (!force) {
      const dup = await Exams.findOne(
        { college_id: { $in: [target, String(target)] }, name: src.name },
        { _id: 1, ID: 1 },
      ).lean();
      if (dup) {
        return res.status(409).json({
          exists: true,
          message: `في الكلية المختارة مادةٌ بالاسم نفسه (رقم ${dup.ID ?? "—"})`,
          existing: { _id: String(dup._id), ID: dup.ID },
        });
      }
    }

    // eslint-disable-next-line no-unused-vars
    const { _id: _drop, __v, ...rest } = src;

    const lectures = (src.lectures || []).map((l) => ({
      ...l,
      summary: l.summary ? { ...l.summary, sections: clearNotes(l.summary.sections) } : l.summary,
    }));
    // الملخّص القديم على مستوى المادة (قبل الهجرة) — ملاحظاته للطلاب أيضاً
    const legacySummary = Array.isArray(src.summary)
      ? src.summary.map((sm) => ({ ...sm, sections: clearNotes(sm.sections) }))
      : src.summary;

    const copy = new Exams({
      ...rest,
      ID: await nextSubjectID(),
      college_id: target,
      lectures,
      summary: legacySummary,
      // ما مصدره الطلاب يبدأ من الصفر
      available_to: [],
      available_to_moadal: [],
      number_of_free_subscriptions: 0,
      number_of_free_moadal_subscriptions: 0,
      total_profit: 0,
    });
    await copy.save();

    console.log(
      `🧬 استنساخ «${src.name}» (${src.ID}) من الكلية ${src.college_id} إلى ${target} ← ${copy.ID} · ${lectures.length} محاضرة`,
    );

    return res.status(201).json({
      message: "استُنسخت المادة",
      _id: String(copy._id),
      ID: copy.ID,
      name: copy.name,
      college_id: target,
      lectures: lectures.length,
    });
  } catch (error) {
    console.error("خطأ في استنساخ المادة:", error);
    return res.status(500).json({ message: "تعذّر الاستنساخ — لم يُنشأ شيء" });
  }
};
