import mongoose from "mongoose";

// ─── أهلية خطة «معدل» ─────────────────────────────────────────────────────────
// مصدر واحد للحقيقة: المادة مؤهلة إن كانت كل محاضراتها مكتملة الأنواع الخمسة
// (نصّ المقرَّر + ملخّص + أسئلة + بطاقات + تحريري).
//
// لماذا وحدة مستقلة؟ لأن الأهلية كانت تُحسب مرة واحدة فقط عند حفظ المحاضرات،
// فإن حُذف سؤال أو ملخص من محرر المادة تبقى المادة معلَّمة «مؤهلة» زوراً —
// فيدفع الطالب ثمن معدل ويجد محتوى ناقصاً. الآن تُعاد الحسبة عند كل تعديل.
//
// ── الهيكل الموحَّد ──
// كانت هذه الوحدة تقرأ الهيكل القديم: `lecture.text_ref` و`exam.summary[]`
// المربوط بـ`meta.lecture_id` و`lecture.questions_lecture_name` المطابَق
// بالاسم النصّي. وقد صار المحتوى كلّه **داخل كيان المحاضرة**، فبقيت تلك
// الحقول فارغةً في كل مادة تُنتَج اليوم — فتُرجع الوحدة `false` مهما اكتملت
// المادة، وتدهس الحسبة الصحيحة عند أي حفظ جزئي.
//
// وهذا هو التعريف نفسه الذي يستعمله `save_lecture_v2`: تعريفان متناقضان
// للأهلية يعني أن آخر مَن يحفظ يفوز، وهو ما كان يحدث.

/** هل المحاضرة مكتملة الأنواع الخمسة؟ */
const partsOf = (lecture) => {
  const written = (lecture.written_exam?.questions || []).filter(
    (q) => String(q?.question || "").trim() && String(q?.model_answer || "").trim(),
  );
  const flash = (lecture.flash_cards || []).filter(
    (c) => String(c?.front || "").trim() && String(c?.back || "").trim(),
  );
  const questions = (lecture.questions || []).filter((q) =>
    String(q?.question || "").trim(),
  );
  const sections = lecture.summary?.sections || [];

  return {
    has_text: Boolean(String(lecture.curriculum?.text || "").trim()),
    has_summary: sections.length > 0,
    summary_sections: sections.length,
    has_questions: questions.length > 0,
    questions_count: questions.length,
    has_flash: flash.length > 0,
    flash_count: flash.length,
    has_written: written.length > 0,
    written_count: written.length,
  };
};

/**
 * يحسب حالة اكتمال كل محاضرة في المادة.
 * يعمل على وثيقة Mongoose أو كائن lean.
 */
export const buildCompletenessReport = (exam) =>
  (exam.lectures || []).map((lecture) => ({
    lecture_id: lecture.lecture_id,
    // الاسم المعتمد `name`؛ و`title` بقيّة من الهيكل القديم تُقرأ إن وُجدت
    title: lecture.name || lecture.title || "",
    ...partsOf(lecture),
  }));

export const isEligibleFromReport = (report) =>
  report.length > 0 &&
  report.every(
    (c) =>
      c.has_text &&
      c.has_summary &&
      c.has_questions &&
      c.has_flash &&
      c.has_written,
  );

/** ما ينقص المادة لتصير مؤهَّلة — لتقوله اللوحة بدل «غير مؤهلة» مجرَّدة */
export const missingFromReport = (report) => {
  const LABELS = {
    has_text: "نصّ المقرَّر",
    has_summary: "الملخّص",
    has_questions: "الأسئلة",
    has_flash: "البطاقات",
    has_written: "التحريري",
  };
  return report
    .filter((c) => !Object.keys(LABELS).every((k) => c[k]))
    .map((c) => ({
      lecture_id: c.lecture_id,
      title: c.title,
      missing: Object.entries(LABELS)
        .filter(([k]) => !c[k])
        .map(([, label]) => label),
    }));
};

/**
 * يعيد حساب الأهلية ويضبطها على الوثيقة (بلا حفظ — المستدعي يحفظ).
 * يعيد { changed, was, now, report } للتسجيل والتنبيه.
 */
export const recomputeMoadalAvailability = (exam) => {
  const report = buildCompletenessReport(exam);
  const now = isEligibleFromReport(report);
  const was = exam.moadal_available === true;
  exam.moadal_available = now;
  return { changed: was !== now, was, now, report, missing: missingFromReport(report) };
};

// ─── الحساب داخل القاعدة ──────────────────────────────────────────────────────
// النسخة أعلاه تحتاج وثيقة المادة كاملةً في الذاكرة — وهي ثقيلة: نصّ المقرَّر
// وحده قد يبلغ مئات الكيلوبايتات لكل محاضرة، فمادةٌ من أربعين محاضرة تُنقل
// كلّها على السلك لتُقرأ منها **خمسة أعداد** لكل محاضرة.
//
// هذه تحسبها في القاعدة وتُرجع الأعلام وحدها (عشرات البايتات مهما كبرت
// المادة) — بالمنطق نفسه حرفاً بحرف: نصٌّ غير فارغ، وأقسام ملخّص، وأسئلة
// بنصّ، وبطاقات بوجهين، وتحريريٌّ بسؤالٍ وجواب نموذجي.
//
// $trim يطابق `String(x).trim()` في جافاسكربت لمسافات ASCII والسطور،
// وهو ما تفحصه النسخة أعلاه.
const nonEmpty = (expr) => ({
  $gt: [{ $strLenCP: { $trim: { input: { $ifNull: [expr, ""] } } } }, 0],
});

const toObjectId = (v) =>
  typeof v === "string" ? mongoose.Types.ObjectId.createFromHexString(v) : v;

/** يقرأ تقرير الاكتمال من القاعدة بلا نقل أي محتوى. */
export const readCompletenessFromDb = async (Model, subjectId) => {
  const rows = await Model.aggregate([
    // التحويل صريح: $match لا يُلقّم النصّ إلى ObjectId تلقائياً كما يفعل find
    { $match: { _id: toObjectId(subjectId) } },
    { $project: { lectures: { $ifNull: ["$lectures", []] } } },
    { $unwind: { path: "$lectures", preserveNullAndEmptyArrays: false } },
    {
      $project: {
        lecture_id: "$lectures.lecture_id",
        title: { $ifNull: ["$lectures.name", { $ifNull: ["$lectures.title", ""] }] },
        has_text: nonEmpty("$lectures.curriculum.text"),
        has_summary: {
          $gt: [{ $size: { $ifNull: ["$lectures.summary.sections", []] } }, 0],
        },
        has_questions: {
          $gt: [
            {
              $size: {
                $filter: {
                  input: { $ifNull: ["$lectures.questions", []] },
                  as: "q",
                  cond: nonEmpty("$$q.question"),
                },
              },
            },
            0,
          ],
        },
        has_flash: {
          $gt: [
            {
              $size: {
                $filter: {
                  input: { $ifNull: ["$lectures.flash_cards", []] },
                  as: "c",
                  cond: { $and: [nonEmpty("$$c.front"), nonEmpty("$$c.back")] },
                },
              },
            },
            0,
          ],
        },
        has_written: {
          $gt: [
            {
              $size: {
                $filter: {
                  input: { $ifNull: ["$lectures.written_exam.questions", []] },
                  as: "w",
                  cond: {
                    $and: [nonEmpty("$$w.question"), nonEmpty("$$w.model_answer")],
                  },
                },
              },
            },
            0,
          ],
        },
      },
    },
  ]);
  return rows;
};
