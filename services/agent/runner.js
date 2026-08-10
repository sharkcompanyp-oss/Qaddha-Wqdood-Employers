// ─── وكيل الشكاوى — الهيكل الموحَّد ─────────────────────────────────────────
// أُعيدت كتابته بعد توحيد الهيكل. النسخة السابقة كانت تقرأ subjectDoc.questions
// وsubjectDoc.summary وتكتب في `questions.${i}` و`summary.${si}.sections.${sj}` —
// حقولٌ لم تعد موجودة، فكان كل تعديل يفشل صامتاً أو يخطئ الهدف.
//
// المسار الآن مباشر بلا تخمين:
//   الشكوى تحمل subject_id وlecture_id → نفتح المحاضرة بعينها
//   → نأخذ المحتوى المشكوّ عنه حسب النوع → نحكم بالاعتماد على نصّ المقرَّر
//   → نصحّح الحقل بمسارٍ صريح داخل lectures[i] → نشعر الطالب ونمنح النقاط.
//
// الأسماء تبقى مساراً احتياطياً للشكاوى القديمة التي لا تحمل معرّفات.

import complaint from "../../models/complaint.js";
import Subject from "../../models/exam.js";
import { callExamsBackend } from "../../config/exams_backend.js";
import AgentSetting from "../../models/agent_setting.js";
import * as judge from "./judge.js";
import { norm } from "./lectures.js";
import { awardPointsTo } from "../../controllers/award_points_controller.js";

// هذان النوعان وحدهما يبقيان لك: «مقرر مختلف» شكوى على المادة كلها لا على
// عنصرٍ بعينه (قرارها رفع مقرَّر جديد — قرارٌ إداريّ لا تصحيح نصّ)، و«خطأ آخر»
// نصّ حرّ بلا هدفٍ محدَّد. ما عداهما يحسمه الوكيل بنفسه.
const ALWAYS_HUMAN = new Set(["different_curriculum", "other_error"]);

// ── تحديد المادة والمحاضرة ────────────────────────────────────────────────────

/** يفتح المادة: بالمعرّف أولاً (حاسم)، ثم بالاسم (للشكاوى القديمة) */
async function resolveSubject(c) {
  if (c.subject_id) {
    const byId = await Subject.findById(c.subject_id).catch(() => null);
    if (byId) return { subject: byId };
    return { error: `المادة بالمعرّف '${c.subject_id}' غير موجودة.` };
  }
  const matches = await Subject.find({ name: c.subject_name });
  if (matches.length === 0)
    return { error: `لم أجد المادة '${c.subject_name}'.` };
  if (matches.length > 1)
    return { error: `أكثر من مادة بالاسم '${c.subject_name}' — غامض.` };
  return { subject: matches[0] };
}

/** يحدّد المحاضرة داخل المادة ويعيد فهرسها (المسار للكتابة يحتاج الفهرس) */
function resolveLecture(subject, c) {
  const ls = subject.lectures || [];
  if (ls.length === 0) return { error: "المادة بلا محاضرات." };

  if (c.lecture_id) {
    const i = ls.findIndex((l) => String(l.lecture_id) === String(c.lecture_id));
    if (i === -1) return { error: `المحاضرة '${c.lecture_id}' غير موجودة.` };
    return { index: i, lecture: ls[i] };
  }

  const want = norm(c.lecture_name || "");
  if (!want) return { error: "الشكوى بلا محاضرة محدّدة." };

  const nameOf = (l) => norm(l.name || l.title || l.questions_lecture_name || "");
  let hits = ls
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => nameOf(l) === want);
  if (hits.length === 0) {
    hits = ls
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => {
        const n = nameOf(l);
        return n && (n.includes(want) || want.includes(n));
      });
  }
  if (hits.length === 1) return { index: hits[0].i, lecture: hits[0].l };
  if (hits.length > 1)
    return { error: `اسم المحاضرة '${c.lecture_name}' يطابق أكثر من محاضرة.` };
  return { error: `لم أجد المحاضرة '${c.lecture_name}'.` };
}

// ── انتقاء المحتوى المشكوّ عنه حسب نوع الشكوى ────────────────────────────────

/** يختار من نصّ الشكوى العنصرَ المقصود داخل المحاضرة */
function pickTarget(c, lecture) {
  const hint = norm(c.question || c.complaint || "");

  if (c.type === "question_error") {
    const qs = lecture.questions || [];
    if (qs.length === 0) return { error: "المحاضرة بلا أسئلة." };
    let i = qs.findIndex((q) => norm(q.question || "") === norm(c.question || ""));
    if (i === -1 && hint) {
      i = qs.findIndex((q) => {
        const n = norm(q.question || "");
        return n && (n.includes(hint) || hint.includes(n));
      });
    }
    if (i === -1) return { error: "لم أجد السؤال داخل المحاضرة." };
    return {
      kind: "question",
      path: `lectures.${lecture.__i}.questions.${i}`,
      record: {
        question: qs[i].question || "",
        options: qs[i].options || [],
        answer: qs[i].answer ?? "",
      },
    };
  }

  if (c.type === "summary_error") {
    const secs = lecture.summary?.sections || [];
    if (secs.length === 0) return { error: "المحاضرة بلا ملخص." };
    let j = c.section_id ? secs.findIndex((s) => s.id === c.section_id) : -1;
    if (j === -1 && hint) {
      j = secs.findIndex((s) => norm(s.title || "").includes(hint));
    }
    if (j === -1) return { error: `القسم '${c.section_id}' غير موجود.` };
    return {
      kind: "summary",
      path: `lectures.${lecture.__i}.summary.sections.${j}`,
      record: secs[j],
    };
  }

  if (c.type === "flash_error") {
    const cards = lecture.flash_cards || [];
    if (cards.length === 0) return { error: "المحاضرة بلا بطاقات." };
    let i = hint
      ? cards.findIndex((x) => {
          const f = norm(x.front || "");
          const b = norm(x.back || "");
          return (f && (f.includes(hint) || hint.includes(f))) || (b && hint.includes(b));
        })
      : -1;
    if (i === -1) return { error: "لم أحدّد البطاقة المقصودة من نصّ الشكوى." };
    return {
      kind: "flash",
      path: `lectures.${lecture.__i}.flash_cards.${i}`,
      record: { front: cards[i].front || "", back: cards[i].back || "" },
    };
  }

  if (c.type === "written_error") {
    const qs = lecture.written_exam?.questions || [];
    if (qs.length === 0) return { error: "المحاضرة بلا اختبار تحريري." };
    let i = hint
      ? qs.findIndex((q) => {
          const n = norm(q.question || "");
          return n && (n.includes(hint) || hint.includes(n));
        })
      : -1;
    if (i === -1) return { error: "لم أحدّد سؤال التحريري المقصود." };
    return {
      kind: "written",
      path: `lectures.${lecture.__i}.written_exam.questions.${i}`,
      record: {
        question: qs[i].question || "",
        model_answer: qs[i].model_answer || "",
      },
    };
  }

  return { error: `نوع غير معروف '${c.type}'.` };
}

// ── تطبيق التصحيح ────────────────────────────────────────────────────────────

// الحقول المسموح تعديلها لكل نوع. القائمة بيضاء صراحةً: نموذجٌ يقترح حقلاً
// خارجها كان سيكتب في مكانٍ عشوائي داخل الوثيقة.
const EDITABLE = {
  question: new Set(["question", "answer", "options"]),
  summary: new Set(["title", "content_blocks", "__section"]),
  flash: new Set(["front", "back"]),
  written: new Set(["question", "model_answer"]),
};

/** يكتب التصحيح في مساره الصريح ويعيد ما قبله وما بعده للسجل */
async function applyFix(subjectId, target, fix) {
  const allowed = EDITABLE[target.kind];
  if (!allowed) throw new Error(`نوع غير قابل للتعديل: ${target.kind}`);

  // الملخّص يُستبدل قسمُه كاملاً (بنية متداخلة لا حقل مفرد)
  if (target.kind === "summary") {
    const next = fix.section;
    if (!next || typeof next !== "object")
      throw new Error("تصحيح الملخص يحتاج كائن القسم كاملاً.");
    if (next.id && target.record?.id && next.id !== target.record.id)
      throw new Error("معرّف القسم في التصحيح لا يطابق الأصل.");
    await Subject.updateOne({ _id: subjectId }, { $set: { [target.path]: next } });
    return {
      kind: target.kind,
      field: "__section",
      before: JSON.stringify(target.record).slice(0, 500),
      after: JSON.stringify(next).slice(0, 500),
    };
  }

  const field = fix.field;
  if (!allowed.has(field))
    throw new Error(`حقل غير مسموح لهذا النوع: ${field}`);
  if (fix.new === undefined || fix.new === null)
    throw new Error("التصحيح بلا قيمة جديدة.");

  await Subject.updateOne(
    { _id: subjectId },
    { $set: { [`${target.path}.${field}`]: fix.new } },
  );

  return {
    kind: target.kind,
    field,
    before: String(target.record?.[field] ?? "").slice(0, 500),
    after: String(
      typeof fix.new === "object" ? JSON.stringify(fix.new) : fix.new,
    ).slice(0, 500),
  };
}

// ── مكافأة الطالب ────────────────────────────────────────────────────────────

/** يمنح نقاطاً حين تصحّ الشكوى — فشلُه لا يُسقط المعالجة.
 *  نستدعي منطق المنح مباشرةً: هو في هذا الخادم نفسه، ويتكفّل بالمجموع
 *  والشارة والسجلّ. القيمة (30) من AWARD_PRESETS.complaint_valid — مصدر
 *  الحقيقة واحد فلا يتفرّع رقمان. */
async function awardPoints(studentID) {
  try {
    const r = await awardPointsTo({
      student_ID: studentID,
      reason_code: "complaint_valid",
      note: "شكوى صحيحة صحّحها الوكيل آلياً",
      admin_name: "وكيل الشكاوى",
      source_type: "agent",
    });
    return r.delta;
  } catch {
    return 0;
  }
}

// ── إشعار الطالب + إغلاق الشكوى ──────────────────────────────────────────────

async function notifyAndClose(c, reply, { awarded = 0, fixRecord = null } = {}) {
  const body = awarded
    ? `${reply || "شكراً لتنبيهك 💜"}\n\n🎁 +${awarded} نقطة لأن ملاحظتك كانت صحيحة`
    : reply || "شكراً لتنبيهك 💜";

  const sent = await callExamsBackend(
    "/notify-student",
    { student_ID: c.student_ID, title: "تمت الإستجابة للشكوى", body },
    "إشعار وكيل الشكاوى",
  );
  if (!sent.ok) {
    // لا نغلق شكوى لم يُبلَّغ صاحبها — تبقى للمحاولة القادمة
    return { notified: false, note: `notify failed: ${sent.error || sent.status}` };
  }

  // الشكوى المصحَّحة تبقى بأثرها لا تُحذف: التعديل الآلي بلا سجلٍّ يُراجَع خطر
  if (fixRecord) {
    await complaint.updateOne(
      { _id: c._id },
      {
        $set: {
          status: "fixed",
          applied_fix: { ...fixRecord, at: new Date() },
          points_awarded: awarded,
        },
      },
    );
    return { notified: true, note: "تم التصحيح والإشعار — الشكوى محفوظة بأثرها" };
  }

  await complaint.deleteOne({ _id: c._id });
  return { notified: true, note: "student notified, complaint deleted" };
}

// ── معالجة شكوى واحدة ────────────────────────────────────────────────────────

async function processOne(c, cfg, ctx) {
  const base = {
    complaint_id: String(c._id),
    type: c.type,
    student_ID: c.student_ID,
    subject: c.subject_name,
  };
  const human = (reason, extra = {}) => ({
    ...base,
    ...extra,
    status: "human",
    action: "ESCALATE_TO_HUMAN",
    reason,
  });

  if (ALWAYS_HUMAN.has(c.type))
    return human(`النوع '${c.type}' يُراجَع بشرياً دائماً.`);

  // ① المادة
  const s = await resolveSubject(c);
  if (s.error) return human(s.error);
  const subject = s.subject;

  // ② المحاضرة
  const L = resolveLecture(subject, c);
  if (L.error) return human(L.error, { subject_id: String(subject._id) });
  const lecture = { ...(L.lecture.toObject?.() ?? L.lecture), __i: L.index };

  // ③ المحتوى المشكوّ عنه
  const target = pickTarget(c, lecture);
  if (target.error)
    return human(target.error, {
      subject_id: String(subject._id),
      lecture_id: lecture.lecture_id,
    });

  // ④ نصّ المقرَّر — صار داخل المحاضرة نفسها، بلا بحثٍ في كولكشن منفصل
  const lectureText = String(lecture.curriculum?.text || "").trim();
  if (!lectureText) {
    return human("لا نصّ مقرَّر لهذه المحاضرة — لا مرجع للحكم.", {
      subject_id: String(subject._id),
      lecture_id: lecture.lecture_id,
    });
  }

  // ⑤ الحكم
  const verdict = await judge.judgeWithLecture({
    complaint: c,
    record: target.record,
    recordKind: target.kind,
    lectureText,
    ctx,
  });
  const withV = {
    ...base,
    subject_id: String(subject._id),
    lecture_id: lecture.lecture_id,
    lecture_name: lecture.name || lecture.title || "",
    verdict,
  };

  // ⑥ لا خطأ → ردّ بلا تعديل ولا نقاط
  if (verdict.verdict === "no_error") {
    const side = cfg.dry_run
      ? { notified: false, note: `[محاكاة] كان سيرد: ${verdict.student_reply}` }
      : await notifyAndClose(c, verdict.student_reply);
    return {
      ...withV,
      status: "replied",
      action: "REPLY_NO_ERROR",
      reply: verdict.student_reply,
      side,
    };
  }

  // ⑦ خطأ واضح وواثق → صحّح وامنح النقاط
  if (judge.shouldAutofix(verdict, cfg.threshold)) {
    if (cfg.dry_run) {
      return {
        ...withV,
        status: "fixed",
        action: "AUTO_FIX",
        fix: verdict.fix,
        target: target.path,
        side: {
          notified: false,
          note: `[محاكاة] كان سيصحّح ${target.path} ويمنح نقاط الشكوى الصحيحة`,
        },
      };
    }

    let fixRecord;
    try {
      fixRecord = await applyFix(subject._id, target, verdict.fix);
    } catch (e) {
      return human(`تعذّر تطبيق التصحيح: ${e.message}`, {
        verdict,
        target: target.path,
      });
    }

    const awarded = await awardPoints(c.student_ID);

    const side = await notifyAndClose(c, verdict.student_reply, {
      awarded,
      fixRecord,
    });
    return {
      ...withV,
      status: "fixed",
      action: "AUTO_FIX",
      fix: verdict.fix,
      target: target.path,
      applied: fixRecord,
      points: awarded,
      side,
    };
  }

  // ⑧ لم يُثبت خطأ (غير واثق، أو الموضوع خارج المحاضرة، أو ثقة دون العتبة).
  // نردّ على الطالب ونغلق: الوكيل موجود ليكفيك الشكاوى لا ليعيدها إليك.
  // ما يُحال إليك هو ما تعذّر الوصول إليه أصلاً (مادة/محاضرة/عنصر مفقود)،
  // وذلك عطلٌ في البيانات لا حكمٌ علميّ.
  const reply =
    verdict.student_reply ||
    "راجعنا ملاحظتك والمحتوى مطابق لما في المحاضرة 💜";
  const side = cfg.dry_run
    ? { notified: false, note: `[محاكاة] كان سيرد: ${reply}` }
    : await notifyAndClose(c, reply);
  return {
    ...withV,
    status: "replied",
    action: "REPLY_NO_FIX",
    reply,
    reason:
      verdict.verdict === "uncertain" && !verdict.topic_found_in_lecture
        ? "الموضوع غير مذكور في المحاضرة"
        : "لم يُثبَت خطأ بشاهدٍ من المحاضرة",
    side,
  };
}

// ── نقطة الدخول ──────────────────────────────────────────────────────────────

export async function runAgent({ overrides = {} } = {}) {
  let setting = await AgentSetting.findOne({ key: "default" });
  if (!setting) setting = await AgentSetting.create({ key: "default" });
  const cfg = {
    provider: overrides.provider || setting.provider,
    model: overrides.model || setting.model,
    dry_run: overrides.dry_run ?? setting.dry_run,
    threshold: overrides.threshold ?? setting.threshold,
    limit: overrides.limit ?? setting.limit,
  };

  const ctx = {
    provider: cfg.provider,
    model: cfg.model,
    apiKeys: {
      gemini: process.env.GEMINI_API_KEY,
      openrouter: process.env.OPENROUTER_API_KEY,
      dahl: process.env.DAHL_API_KEY,
    },
    // أمثلة ردودك السابقة — يتعلّم منها الوكيل نبرتك
    replyExamples: (setting.reply_examples || []).slice(-12),
  };

  // الشكاوى المعالَجة لا تُعاد معالجتها
  const query = complaint.find({ status: { $in: [null, "new"] } });
  if (cfg.limit) query.limit(cfg.limit);
  const complaints = await query.exec();

  const results = [];
  for (const c of complaints) {
    try {
      results.push(await processOne(c, cfg, ctx));
    } catch (e) {
      results.push({
        complaint_id: String(c._id),
        type: c.type,
        subject: c.subject_name,
        status: "error",
        action: "ERROR",
        reason: `${e.name}: ${e.message}`,
      });
    }
  }

  const tally = {
    fixed: results.filter((r) => r.status === "fixed").length,
    replied: results.filter((r) => r.status === "replied").length,
    human: results.filter((r) => r.status === "human").length,
    error: results.filter((r) => r.status === "error").length,
  };
  return {
    mode: cfg.dry_run ? "DRY-RUN" : "LIVE",
    provider: cfg.provider,
    model: cfg.model,
    count: results.length,
    tally,
    results,
    ran_at: new Date().toISOString(),
  };
}
