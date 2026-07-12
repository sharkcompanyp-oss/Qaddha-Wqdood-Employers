// طبقة الحكم — تحكم على الشكوى بالاعتماد على نص المحاضرة (المرجع).
// قاعدة توفير الطلبات: الخطأ الإملائي الواضح فقط يُصحّح آلياً؛ الخطأ العلمي
// يُحال دائماً للمقرّر (البشر) ولا يُصحّح آلياً أبداً.

import { askText, extractJson } from "./provider.js";

const GROUNDED_SYSTEM = `أنت مراجع محتوى أكاديمي دقيق لتطبيق امتحانات جامعي سوري (محتوى عربي).
قدّم طالبٌ شكوى تدّعي وجود خطأ. لديك:
  (أ) نص المحاضرة الأصلية (المرجع الوحيد المعتمد للحكم)،
  (ب) السجل موضع الشكوى (سؤال أو فقرة ملخّص)،
  (ج) ادّعاء الطالب.

احكم بالاعتماد على نص المحاضرة فقط، وصنّف الخطأ:
- "spelling_error": خطأ إملائي/طباعي واضح في نص عربي. آمن للتصحيح الآلي عند وضوحه.
- "scientific_error": خطأ علمي/مفاهيمي (تعريف خاطئ، إجابة صحيحة خاطئة، مفهوم مغلوط).
- "no_error": السجل صحيح ومطابق للمحاضرة؛ الطالب مخطئ.
- "uncertain": الموضوع غير مذكور بوضوح في المحاضرة أو لا تستطيع الجزم. للبشر.

قاعدة مهمة: الخطأ العلمي لا يُصحّح آلياً أبداً — يُحال دائماً للمقرّر (البشر).
فقط الخطأ الإملائي الواضح يُقترح له تصحيح.

صياغة الرد للطالب (student_reply): مختصر جداً، جملتان كحدٍّ أقصى، بلا حشو، وينتهي
بالرمز 💜. أمثلة: "شكراً لتنبيهك، صحّحنا الخطأ 💜" / "راجعنا والمعلومة صحيحة كما في المحاضرة 💜".

أعد JSON فقط (بدون أسوار) بالمفاتيح:
  verdict, confidence (0..1), error_clarity ("clear"|"ambiguous"),
  topic_found_in_lecture (true/false),
  fix (للإملائي فقط: {"field":..., "old":..., "new":...} وإلا null),
  reason_for_human, student_reply`;

export async function judgeWithLecture({
  complaint,
  record,
  recordKind, // "question" | "summary"
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
    GROUNDED_SYSTEM +
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
  v.fix = v.fix ?? null;
  v.reason_for_human = v.reason_for_human ?? null;
  v.student_reply = v.student_reply || "شكراً لتنبيهك، وصلت شكواك 💜";

  // فرض القاعدة: الخطأ العلمي لا يُصحّح آلياً أبداً — يُلغى أي تصحيح ويُحال للبشر.
  if (v.verdict === "scientific_error") {
    v.fix = null;
    if (!v.reason_for_human)
      v.reason_for_human = "خطأ علمي محتمل — يُحال للمقرّر للمراجعة.";
  }
  return v;
}

// البوابة: يُصحَّح آلياً فقط الخطأ الإملائي الواضح مع تصحيح وثقة كافية.
export function shouldAutofix(verdict, threshold) {
  if (verdict.verdict !== "spelling_error") return false;
  if (!verdict.fix) return false;
  if (Number(verdict.confidence || 0) < threshold) return false;
  return verdict.error_clarity === "clear";
}
