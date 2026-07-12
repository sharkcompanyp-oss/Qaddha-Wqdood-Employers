// المنسّق — يشغّل الوكيل على الشكاوى المعلّقة. لأن كل شيء يعمل داخل الـ backend
// (على Render) فلا تعارض VPN: نقرأ Mongo ونستدعي النموذج ونكتب في خطوة واحدة.
//
// لكل شكوى:
//   1) جِد السجل الحقيقي (سؤال/فقرة) — كما يفعل get_complaints
//   2) أسنِد إلى نص المحاضرة: college→section → مجلد المادة → المحاضرة → نصها
//   3) احكم بالاعتماد على المحاضرة
//   4) إملائي واضح → صحّح (إن لم يكن dry_run)؛ علمي/غير واثق → للبشر؛ لا خطأ → رد
//   5) أشعر الطالب واحذف الشكوى (كما يفعل responde-to-complaint)

import complaint from "../../models/complaint.js";
import Subject from "../../models/exam.js";
import Students from "../../models/student.js";
import AgentSetting from "../../models/agent_setting.js";
import * as lectures from "./lectures.js";
import * as judge from "./judge.js";
import { norm } from "./lectures.js";

const ALWAYS_HUMAN = new Set(["different_curriculum", "other_error"]);

// ── إيجاد السجل الحقيقي داخل المادة (نفس منطق get_section/get_question) ─────

function findQuestion(subjectDoc, questionText) {
  const qs = subjectDoc.questions || [];
  const n = (questionText || "").trim();
  let idx = qs.findIndex((q) => (q.question || "") === questionText);
  if (idx === -1) idx = qs.findIndex((q) => (q.question || "").trim() === n);
  return idx === -1 ? null : { index: idx, obj: qs[idx] };
}

function lectureExact(title, name) {
  return !!norm(name) && norm(title) === norm(name);
}
function lectureContains(title, name) {
  const a = norm(title),
    b = norm(name);
  return b && (a.includes(b) || b.includes(a));
}

function findSection(subjectDoc, sectionId, lectureName) {
  const summary = subjectDoc.summary || [];
  const hits = [];
  summary.forEach((sm, si) => {
    const title = sm?.meta?.lecture_title || "";
    (sm.sections || []).forEach((sec, sj) => {
      if (sec.id === sectionId) hits.push({ si, sj, title, sec });
    });
  });
  if (!hits.length) return { status: "notfound" };
  if (hits.length === 1) return { status: "ok", ...hits[0] };
  if (lectureName) {
    const exact = hits.filter((h) => lectureExact(h.title, lectureName));
    if (exact.length === 1) return { status: "ok", ...exact[0] };
    if (exact.length === 0) {
      const loose = hits.filter((h) => lectureContains(h.title, lectureName));
      if (loose.length === 1) return { status: "ok", ...loose[0] };
    }
  }
  return { status: "ambiguous", titles: hits.map((h) => h.title) };
}

// ── تطبيق التصحيح (تعديل جراحي للحقل الخاطئ فقط) ───────────────────────────

async function applyQuestionFix(subjectId, qIndex, fix) {
  const field = fix.field;
  if (!["question", "answer", "options"].includes(field))
    throw new Error(`حقل تصحيح غير معروف: ${field}`);
  await Subject.updateOne(
    { _id: subjectId },
    { $set: { [`questions.${qIndex}.${field}`]: fix.new } },
  );
}

async function applySectionFix(subjectId, si, sj, newSection) {
  await Subject.updateOne(
    { _id: subjectId },
    { $set: { [`summary.${si}.sections.${sj}`]: newSection } },
  );
}

// ── إشعار الطالب + حذف الشكوى (يعكس responde_to_complaint) ────────────────

async function notifyAndClose(c, reply, cfg) {
  const backend = process.env.EXAMS_BACKEND || "https://exams-back.onrender.com";
  try {
    await fetch(`${backend}/notify-student`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_ID: c.student_ID,
        title: "تمت الإستجابة للشكوى",
        body: reply || "شكراً لتنبيهك 💜",
        INTERNAL_SECRET: process.env.INTERNAL_SECRET,
      }),
    });
  } catch (e) {
    return { notified: false, note: `notify failed: ${e.message}` };
  }
  await complaint.deleteOne({ _id: c._id });
  return { notified: true, note: "student notified, complaint deleted" };
}

// ── معالجة شكوى واحدة → كائن نتيجة ─────────────────────────────────────────

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

  // 1) المادة الحقيقية في Subjects (بالاسم)
  const subjMatches = await Subject.find({ name: c.subject_name });
  if (subjMatches.length === 0)
    return human(`لم أجد المادة '${c.subject_name}' في قاعدة الأسئلة.`);
  if (subjMatches.length > 1)
    return human(`أكثر من مادة بالاسم '${c.subject_name}' — غامض.`);
  const subjectDoc = subjMatches[0];

  // السجل الحقيقي
  let record = null,
    recordKind,
    locator = null;
  if (c.type === "question_error") {
    const q = findQuestion(subjectDoc, c.question);
    if (!q) return human("لم أجد نص السؤال في المادة.");
    record = {
      question: q.obj.question || "",
      options: q.obj.options || [],
      answer: q.obj.answer || "",
      lecture: q.obj.lecture || "",
    };
    recordKind = "question";
    locator = { kind: "question", q_index: q.index };
  } else if (c.type === "summary_error") {
    const r = findSection(subjectDoc, c.section_id, c.lecture_name);
    if (r.status === "notfound")
      return human(`القسم '${c.section_id}' غير موجود.`);
    if (r.status === "ambiguous")
      return human(
        `القسم '${c.section_id}' في أكثر من محاضرة ولم يتطابق اسم المحاضرة (${r.titles.join("، ")}).`,
      );
    record = r.sec;
    recordKind = "summary";
    locator = { kind: "section", si: r.si, sj: r.sj };
  } else {
    return human(`نوع غير معروف '${c.type}'.`);
  }

  // 2) الإسناد إلى نص المحاضرة (من مجموعة lecture_texts)
  const searchSections = lectures.sectionsToSearch(c.college_name);
  const { section, folder } = await lectures.findSubjectAcrossSections(
    c.subject_name,
    searchSections,
    ctx,
  );
  if (!folder)
    return human(
      `لم أجد مجلد نصوص المادة '${c.subject_name}' (بحثت في: ${searchSections.join("، ")}).`,
    );

  const index = await lectures.buildIndex(section, folder);
  if (!index.length)
    return human(`المادة '${folder}' لا تحتوي نصوص محاضرات بعد — للمقرّر.`);

  // نمرّر نص الشكوى أيضاً ليستدلّ النموذج بالموضوع لا بالاسم الحرفي فقط
  const lecId = await lectures.pickLecture(c.lecture_name, index, ctx, c.complaint);
  if (!lecId)
    return human(
      `لم أجد المحاضرة '${c.lecture_name}' ضمن مادة '${folder}'.`,
      { subject_folder: folder },
    );

  const lectureText = await lectures.readLecture(lecId);

  // 3) الحكم بالاعتماد على المحاضرة
  const verdict = await judge.judgeWithLecture({
    complaint: c,
    record,
    recordKind,
    lectureText,
    ctx,
  });
  const withV = { ...base, subject_folder: folder, verdict };

  // 4) القرار
  if (verdict.verdict === "no_error") {
    const side = cfg.dry_run
      ? { notified: false, note: `[محاكاة] كان سيرد: ${verdict.student_reply}` }
      : await notifyAndClose(c, verdict.student_reply, cfg);
    return { ...withV, status: "replied", action: "REPLY_NO_ERROR", reply: verdict.student_reply, side };
  }

  if (judge.shouldAutofix(verdict, cfg.threshold)) {
    const fix = verdict.fix;
    if (!cfg.dry_run) {
      if (recordKind === "question") {
        await applyQuestionFix(subjectDoc._id, locator.q_index, fix);
      } else {
        const ns = fix.section;
        if (ns && ns.id === (record.id || null))
          await applySectionFix(subjectDoc._id, locator.si, locator.sj, ns);
      }
    }
    const side = cfg.dry_run
      ? { notified: false, note: `[محاكاة] كان سيصحّح ويرد: ${verdict.student_reply}` }
      : await notifyAndClose(c, verdict.student_reply, cfg);
    return { ...withV, status: "fixed", action: "AUTO_FIX", fix, reply: verdict.student_reply, side };
  }

  // علمي / غير واثق / موضوع غير موجود → بشر
  let reason = verdict.reason_for_human;
  if (!reason) {
    if (verdict.verdict === "scientific_error") reason = "خطأ علمي محتمل — يُحال للمقرّر.";
    else if (!verdict.topic_found_in_lecture) reason = "الموضوع غير موجود بوضوح في المحاضرة.";
    else reason = "غير واثق — للمراجعة البشرية.";
  }
  return { ...withV, status: "human", action: "ESCALATE_TO_HUMAN", reason };
}

// ── نقطة الدخول ────────────────────────────────────────────────────────────

export async function runAgent({ overrides = {} } = {}) {
  // الإعدادات: من قاعدة البيانات (قابلة للتعديل من اللوحة) مع تجاوزات اختيارية
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
    },
  };

  const query = complaint.find({});
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
