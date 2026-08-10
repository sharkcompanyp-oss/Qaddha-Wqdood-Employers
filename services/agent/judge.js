// طبقة الحكم — تحكم على الشكوى بالاعتماد على نص المحاضرة (المرجع).
//
// المبدأ: الوكيل يحسم الشكوى بنفسه. يقارن ادّعاء الطالب بنصّ المحاضرة،
// فإن وجد خطأً — أيّاً كان نوعه، علمياً أو إملائياً — صحّحه وأشعر ومنح
// النقاط؛ وإن لم يجد، ردّ بأن لا خطأ. لا إحالة إلى البشر: الغرض من الوكيل
// أن يكفي المقرّر مؤونة الشكاوى لا أن يعيدها إليه مصنَّفة.
//
// الضمانة الوحيدة الباقية هي الإسناد: كل تصحيح يجب أن يستند إلى موضعٍ
// بعينه في نصّ المحاضرة (evidence). هذا ليس تقييداً على نوع الخطأ بل على
// مصدره — يمنع أن يعيد النموذج كتابة المحتوى من معرفته العامة بدل المقرَّر
// الذي يُمتحَن به الطالب فعلاً.

import { askText, extractJson } from "./provider.js";

const KIND_LABEL = {
  question: "سؤال اختيار من متعدد",
  summary: "قسم من ملخّص المحاضرة",
  flash: "بطاقة استرجاع (وجه/ظهر)",
  written: "سؤال اختبار تحريري مع جوابه النموذجي",
};

const FIELDS_BY_KIND = {
  question: `"question" (نصّ السؤال) أو "answer" (الإجابة الصحيحة) أو "options" (مصفوفة الخيارات كاملةً)`,
  summary: `أعد القسم كاملاً في المفتاح "section" بنفس بنيته ونفس id`,
  flash: `"front" (وجه البطاقة) أو "back" (ظهرها)`,
  written: `"question" (نصّ السؤال) أو "model_answer" (الجواب النموذجي)`,
};

const buildSystem = (recordKind, replyExamples) => {
  const examples =
    replyExamples && replyExamples.length
      ? `\n\n===== أمثلة على ردودي السابقة (احتذِ نبرتها حرفياً) =====\n` +
        replyExamples.map((e, i) => `${i + 1}. ${e}`).join("\n")
      : "";

  return `أنت مراجع محتوى أكاديمي دقيق لتطبيق امتحانات جامعي سوري (محتوى عربي).
قدّم طالبٌ شكوى تدّعي وجود خطأ. لديك:
  (أ) نص المحاضرة الأصلية (المرجع الوحيد المعتمد للحكم)،
  (ب) السجل موضع الشكوى: ${KIND_LABEL[recordKind] || recordKind}،
  (ج) ادّعاء الطالب.

مهمّتك أن تحسم الشكوى بنفسك: قارن ادّعاء الطالب بنصّ المحاضرة، فإن كان
محقّاً فصحّح الخطأ مهما كان نوعه (علمياً أو مفاهيمياً أو إملائياً أو
طباعياً)، وإن كان مخطئاً فاشرح له باختصار أن المحتوى صحيح.

صنّف حكمك:
- "error_confirmed": يوجد خطأ فعلاً ويمكنك إثباته من نصّ المحاضرة. صحّحه.
- "no_error": السجل صحيح ومطابق للمحاضرة؛ الطالب مخطئ.
- "uncertain": الموضوع غير مذكور في المحاضرة إطلاقاً فلا مرجع للحكم.

قواعد ملزمة:
① كل تصحيح يستند إلى نصّ المحاضرة. املأ "evidence" باقتباسٍ حرفيّ قصير
   من النصّ يثبت الخطأ. بلا اقتباس لا تصحيح — لا تصحّح من معرفتك العامة،
   فالطالب يُمتحَن بهذا المقرَّر لا بما تعرفه أنت.
② إن خالف المقرَّر ما تعرفه أنت، فالمقرَّر هو المرجع. اجعل الحكم
   "no_error" واشرح للطالب أن هذا ما ورد في محاضرته.
③ التصحيح جراحيّ: غيّر الحقل المعنيّ وحده، وأبقِ ما عداه كما هو حرفياً.
④ لا تختلق معلومة ليست في نصّ المحاضرة.
⑤ إن لم تجد الموضوع في المحاضرة أصلاً فالحكم "uncertain" لا "error_confirmed".

حقول التصحيح المسموحة لهذا النوع: ${FIELDS_BY_KIND[recordKind] || "—"}

صياغة الرد للطالب (student_reply): مختصر جداً، جملتان كحدٍّ أقصى، بلا حشو،
وينتهي بالرمز 💜.${examples}

أعد JSON فقط (بدون أسوار) بالمفاتيح:
  verdict, confidence (0..1), error_clarity ("clear"|"ambiguous"),
  topic_found_in_lecture (true/false),
  evidence (اقتباس حرفي قصير من المحاضرة يثبت الحكم، أو null),
  error_kind ("scientific"|"spelling"|"other" — لأثر المراجعة فقط),
  fix ({"field":..., "old":..., "new":...} أو {"section":{...}} للملخّص، وإلا null),
  student_reply`;
};

export async function judgeWithLecture({
  complaint,
  record,
  recordKind, // "question" | "summary" | "flash" | "written"
  lectureText,
  ctx,
}) {
  const payload = {
    record_kind: recordKind,
    student_claim: complaint.complaint || "",
    record,
    context: {
      subject: complaint.subject_name || "",
      lecture: complaint.lecture_name || "",
      college: complaint.college_name || "",
    },
  };
  const prompt =
    buildSystem(recordKind, ctx?.replyExamples) +
    "\n\n===== نص المحاضرة (المرجع) =====\n" +
    (lectureText || "(فارغ)") +
    "\n\n===== بيانات الشكوى =====\n" +
    JSON.stringify(payload, null, 2) +
    "\n\nأعد حكم JSON الآن.";

  const v = extractJson(await askText({ ...ctx, prompt }));

  // تطبيع المفاتيح
  v.verdict = v.verdict || "uncertain";
  v.confidence = typeof v.confidence === "number" ? v.confidence : 0;
  v.error_clarity = v.error_clarity || "ambiguous";
  if (v.topic_found_in_lecture === undefined) v.topic_found_in_lecture = false;
  v.evidence = v.evidence ?? null;
  v.error_kind = v.error_kind || "other";
  v.fix = v.fix ?? null;
  v.student_reply = v.student_reply || "شكراً لتنبيهك، وصلت شكواك 💜";

  // خطأٌ مؤكَّد بلا اقتباسٍ من المحاضرة ليس مؤكَّداً: النموذج يدّعيه أحياناً
  // استناداً إلى معرفته العامة، فيعيد كتابة المقرَّر الذي يُمتحَن به الطالب.
  // بلا شاهد نردّ ردّاً محايداً بدل أن نغيّر المحتوى.
  if (v.verdict === "error_confirmed" && !String(v.evidence || "").trim()) {
    v.verdict = "uncertain";
    v.fix = null;
  }

  return v;
}

// البوابة: يُصحَّح كل خطأ مؤكَّد ومُسنَد إلى المحاضرة، أياً كان نوعه.
export function shouldAutofix(verdict, threshold) {
  if (verdict.verdict !== "error_confirmed") return false;
  if (!verdict.fix) return false;
  if (Number(verdict.confidence || 0) < threshold) return false;
  return verdict.error_clarity === "clear";
}
