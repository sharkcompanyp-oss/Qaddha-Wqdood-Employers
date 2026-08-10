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
  curriculum: "نصّ المقرَّر نفسه (الشكوى على النصّ لا على ما اشتُقّ منه)",
};

const FIELDS_BY_KIND = {
  question: `"question" (نصّ السؤال) أو "answer" (الإجابة الصحيحة) أو "options" (مصفوفة الخيارات كاملةً)`,
  summary: `أعد القسم كاملاً في المفتاح "section" بنفس بنيته ونفس id`,
  flash: `"front" (وجه البطاقة) أو "back" (ظهرها)`,
  written: `"question" (نصّ السؤال) أو "model_answer" (الجواب النموذجي)`,
  curriculum: `{"old": المقطع الخاطئ حرفياً كما ورد في النصّ, "new": المقطع بعد التصحيح}.
  ⚠ لا تُعد النصّ كاملاً أبداً — فقط المقطع المعنيّ. و"old" يجب أن يكون
  نسخاً حرفياً موجوداً في النصّ مرةً واحدة (زد كلمةً قبله أو بعده إن لزم
  لتفريده). لحذف سطرٍ دخيل اجعل "new" نصاً فارغاً.`,
};

const buildSystem = (recordKind, replyExamples) => {
  const examples =
    replyExamples && replyExamples.length
      ? `\n\n===== أمثلة على ردودي السابقة (احتذِ نبرتها حرفياً) =====\n` +
        replyExamples.map((e, i) => `${i + 1}. ${e}`).join("\n")
      : "";

  // الشكوى على النصّ نفسه تقلب دور المرجع: لا يصحّ أن نحتكم إلى النصّ
  // لنبرّئ النصّ. الطالب يقول «المسح الضوئي كتب سلفيات بدل سليفات» —
  // ومطابقةُ الكلمة لما في المحاضرة هي **عين الشكوى** لا ردٌّ عليها.
  const onCurriculum = recordKind === "curriculum";

  const rules = onCurriculum
    ? `قواعد ملزمة:
① الشكوى على النصّ نفسه، فالنصّ ليس مرجعاً يبرّئ نفسه. «الكلمة مطابقة
   لما في المحاضرة» ليس ردّاً — بل هو ما يشتكي منه الطالب بالضبط.
② أكثر هذه الأخطاء من المسح الضوئي: حرف قُرئ خطأً («سلفيات»←«سليفات»)،
   نقطة زائدة أو ناقصة، كلمتان التصقتا، سطر دخيل (بسملة، ترويسة، رقم
   صفحة). احكم بالسياق واللغة والمعنى الطبيّ — هنا **معرفتك مرجع مشروع**.
③ التصحيح جراحيّ: أعد المقطع الخاطئ حرفياً في "old" وصوابه في "new"،
   ولا تُعد النصّ كاملاً أبداً.
④ إن كانت الكلمة صحيحة لغةً ويقبلها السياق الطبي، فالحكم "no_error"
   واشرح للطالب لماذا هي صحيحة.
⑤ لا تُعد صياغة جملةٍ سليمة لمجرّد أنك تفضّل صياغةً أخرى.`
    : `قواعد ملزمة:
① كل تصحيح يستند إلى نصّ المحاضرة. املأ "evidence" باقتباسٍ حرفيّ قصير
   من النصّ يثبت الخطأ. بلا اقتباس لا تصحيح — لا تصحّح من معرفتك العامة،
   فالطالب يُمتحَن بهذا المقرَّر لا بما تعرفه أنت.
② إن خالف المقرَّر ما تعرفه أنت، فالمقرَّر هو المرجع. اجعل الحكم
   "no_error" واشرح للطالب أن هذا ما ورد في محاضرته.
③ التصحيح جراحيّ: غيّر الحقل المعنيّ وحده، وأبقِ ما عداه كما هو حرفياً.
④ لا تختلق معلومة ليست في نصّ المحاضرة.
⑤ إن لم تجد الموضوع في المحاضرة أصلاً فالحكم "uncertain" لا "error_confirmed".`;

  return `أنت مراجع محتوى أكاديمي دقيق لتطبيق امتحانات جامعي سوري (محتوى عربي).
قدّم طالبٌ شكوى تدّعي وجود خطأ. لديك:
  (أ) ${
    onCurriculum
      ? "نصّ المحاضرة — وهو **موضع الشكوى نفسه** لا مرجعاً للحكم"
      : "نص المحاضرة الأصلية (المرجع الوحيد المعتمد للحكم)"
  }،
  (ب) السجل موضع الشكوى: ${KIND_LABEL[recordKind] || recordKind}،
  (ج) ادّعاء الطالب.

مهمّتك أن تحسم الشكوى بنفسك: ${
    onCurriculum
      ? "افحص المقطع المشكوّ عنه في النصّ، فإن كان فيه خطأ (إملائي أو ناتج عن مسح ضوئي أو علميّ) فصحّحه"
      : "قارن ادّعاء الطالب بنصّ المحاضرة، فإن كان محقّاً فصحّح الخطأ مهما كان نوعه (علمياً أو مفاهيمياً أو إملائياً أو طباعياً)"
  }، وإن كان مخطئاً فاشرح له باختصار أن المحتوى صحيح.

صنّف حكمك:
- "error_confirmed": يوجد خطأ فعلاً${onCurriculum ? "" : " ويمكنك إثباته من نصّ المحاضرة"}. صحّحه.
- "no_error": ${onCurriculum ? "المقطع سليم لغةً ومعنى" : "السجل صحيح ومطابق للمحاضرة"}؛ الطالب مخطئ.
- "uncertain": ${onCurriculum ? "لم تجد المقطع المشكوّ عنه في النصّ" : "الموضوع غير مذكور في المحاضرة إطلاقاً فلا مرجع للحكم"}.

${rules}

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
  // استثناء نصّ المقرَّر: هو المرجع والمشكوّ عنه معاً، فلا معنى لطلب
  // اقتباسٍ منه يثبت خطأه. يكفي هناك أن يحدّد المقطع الخاطئ في fix.old.
  const needsEvidence = recordKind !== "curriculum";
  if (
    v.verdict === "error_confirmed" &&
    needsEvidence &&
    !String(v.evidence || "").trim()
  ) {
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
