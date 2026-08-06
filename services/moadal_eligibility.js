// ─── أهلية خطة «معدل» ─────────────────────────────────────────────────────────
// مصدر واحد للحقيقة: المادة مؤهلة إن كانت كل محاضراتها مكتملة الأنواع الخمسة
// (نص + ملخص + أسئلة + فلاش + تحريري).
//
// لماذا وحدة مستقلة؟ لأن الأهلية كانت تُحسب مرة واحدة فقط عند حفظ المحاضرات،
// فإن حُذف سؤال أو ملخص من محرر المادة تبقى المادة معلَّمة «مؤهلة» زوراً —
// فيدفع الطالب ثمن معدل ويجد محتوى ناقصاً. الآن تُعاد الحسبة عند كل تعديل.

/**
 * يحسب حالة اكتمال كل محاضرة في المادة.
 * يعمل على وثيقة Mongoose أو كائن lean.
 */
export const buildCompletenessReport = (exam) => {
  const lectures = exam.lectures || [];
  const summaryArr = Array.isArray(exam.summary) ? exam.summary : [];

  // معرّفات المحاضرات التي لها ملخص مربوط فعلاً
  const summaryLinkedIds = new Set(
    summaryArr
      .map((s) => s?.meta?.lecture_id)
      .filter((id) => id && String(id).trim()),
  );

  // عدد أسئلة كل مجموعة (بالاسم النصي كما يربطها المحرر)
  const questionsByName = new Map();
  (exam.questions || []).forEach((q) => {
    const name = (q.lecture || "").trim();
    if (name) questionsByName.set(name, (questionsByName.get(name) || 0) + 1);
  });

  return lectures.map((lecture) => {
    const writtenQuestions = (lecture.written_exam?.questions || []).filter(
      (q) => (q.question || "").trim() && (q.model_answer || "").trim(),
    );
    const flashCards = (lecture.flash_cards || []).filter(
      (c) => (c.front || "").trim() && (c.back || "").trim(),
    );
    const qCount = questionsByName.get(lecture.questions_lecture_name) || 0;

    return {
      lecture_id: lecture.lecture_id,
      title: lecture.title,
      has_text: Boolean((lecture.text_ref || "").trim()),
      has_summary: summaryLinkedIds.has(lecture.lecture_id),
      has_questions:
        Boolean((lecture.questions_lecture_name || "").trim()) && qCount > 0,
      questions_count: qCount,
      flash_count: flashCards.length,
      has_flash: flashCards.length > 0,
      written_count: writtenQuestions.length,
      has_written: writtenQuestions.length > 0,
    };
  });
};

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

/**
 * يعيد حساب الأهلية ويضبطها على الوثيقة (بلا حفظ — المستدعي يحفظ).
 * يعيد { changed, was, now, report } للتسجيل والتنبيه.
 */
export const recomputeMoadalAvailability = (exam) => {
  const report = buildCompletenessReport(exam);
  const now = isEligibleFromReport(report);
  const was = exam.moadal_available === true;
  exam.moadal_available = now;
  return { changed: was !== now, was, now, report };
};
