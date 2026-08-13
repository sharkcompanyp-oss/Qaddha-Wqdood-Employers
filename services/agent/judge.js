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
import { getPrompt, renderPrompt } from "../prompts.js";

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

/** موجّه الحكم — يُقرأ من مخزن الموجّهات لا من هنا.
 *
 *  كان يُبنى بسبعة تشعّبات متداخلة داخل الكود، فلا سبيل إلى عرضه في حقلٍ
 *  واحد ولا إلى تعديله بلا دفع الخادم. فُصل إلى قالبين كاملين مستقلّين:
 *  شكوى على نصّ المقرَّر (النصّ موضع الشكوى لا مرجعها)، وشكوى على ما اشتُقّ
 *  منه (المحاضرة مرجعٌ يُحتكَم إليه). كلٌّ منهما نصٌّ متّصل في اللوحة. */
const buildSystem = async (recordKind, replyExamples) => {
  const examples =
    replyExamples && replyExamples.length
      ? (await getPrompt("agent_reply_examples_header")) +
        replyExamples.map((e, i) => `${i + 1}. ${e}`).join("\n")
      : "";

  // الشكوى على النصّ نفسه تقلب دور المرجع: لا يصحّ أن نحتكم إلى النصّ
  // لنبرّئ النصّ. الطالب يقول «المسح الضوئي كتب سلفيات بدل سليفات» —
  // ومطابقةُ الكلمة لما في المحاضرة هي **عين الشكوى** لا ردٌّ عليها.
  const name =
    recordKind === "curriculum"
      ? "agent_judge_curriculum"
      : "agent_judge_derived";

  return renderPrompt(name, {
    kind_label: KIND_LABEL[recordKind] || recordKind,
    fields: FIELDS_BY_KIND[recordKind] || "—",
    reply_examples: examples,
  });
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
    (await buildSystem(recordKind, ctx?.replyExamples)) +
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
