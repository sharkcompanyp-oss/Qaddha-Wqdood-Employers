import dotenv from "dotenv";
import { allowTool } from "../services/access.js";
import { renderPrompt } from "../services/prompts.js";
import {
  MODELS,
  EFFORTS,
  DEFAULT_MODEL,
  DEFAULT_EFFORT,
  isConfigured,
  pickModel,
  runClaude,
  submitBatch,
  batchResult,
  sendClaudeError,
  ClaudeError,
} from "../services/claude.js";

dotenv.config();

// ─── التوليد بـ Claude: أسئلة MCQ وملخّص ──────────────────────────────────────
// كل طلب = مهارة (system) + محتوى المحاضرة + موجّه قصير. الموجّهات في
// «الإعدادات ← الموجّهات» (claude_mcq و claude_summary_*) قابلة للتعديل،
// وتشترط أن يكون المخرج هو المطلوب وحده: الواجهة تحلّله آلياً، وأي مقدمة
// أو خاتمة تكسر التحليل.
//
// طريقتان بالطلبات نفسها حرفياً:
//   عادي — الخادم ينتظر الردّ ويعيده (دقيقة أو اثنتان).
//   Batch — الخادم يرسل الدفعة ويعيد معرّفها فوراً، والواجهة تسأل عن النتيجة
//           (/claude-batch/result) حتى تكتمل. لا طلب يُعلَّق بانتظارها.
// الملخّص مرحلتان؛ في Batch تُرسل كل مرحلة دفعةً، والواجهة تربطهما.

const DEFAULT_COUNT = 40;
const MAX_COUNT = 200;

/** هل المفتاح مضبوط، وما الخيارات؟ — تسأله الواجهة لتفعيل الأزرار */
export const Claude_Status = async (req, res) => {
  if (!(await allowTool(req, res))) return;
  return res.status(200).json({
    configured: isConfigured(),
    models: MODELS.map(({ id, label }) => ({ id, label })),
    efforts: EFFORTS,
    default_model: DEFAULT_MODEL,
    default_effort: DEFAULT_EFFORT,
    default_count: DEFAULT_COUNT,
    max_count: MAX_COUNT,
  });
};

const lectureHeader = ({ subject_name, lecture_name }) =>
  [subject_name && `المادة: ${subject_name}`, lecture_name && `المحاضرة: ${lecture_name}`]
    .filter(Boolean)
    .join("\n");

const countOf = (body) =>
  Math.min(
    MAX_COUNT,
    Math.max(1, Math.round(Number(body.number_of_questions)) || DEFAULT_COUNT),
  );

// الصور لا تُرسل: Claude يقرأ نصّاً، ورابط R2 بلا معنى له ويأكل من السياق.
// ماركداون الصورة ‎![شكل](رابط)‎ ووسوم <img> كلاهما يُحذف.
const stripImages = (text) =>
  String(text || "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

// ─── بناء الطلبات — مشترك بين العادي وBatch ──────────────────────────────────

const REQUESTS = {
  /** أسئلة MCQ من الملخّص. body: { summary, number_of_questions } */
  mcq: async (body) => {
    const { summary } = body;
    if (!Array.isArray(summary) || summary.length === 0) {
      throw new ClaudeError(400, "الملخّص فارغ — املأ تبويب الملخص أولاً");
    }
    const n = countOf(body);
    const header = lectureHeader(body);
    return {
      skill: "mcq-doctor-style",
      label: `MCQ «${body.lecture_name || ""}» (${n})`,
      content:
        (header ? `${header}\n\n` : "") +
        `<lecture_summary>\n${JSON.stringify(summary)}\n</lecture_summary>\n\n` +
        (await renderPrompt("claude_mcq", { count: n })),
    };
  },

  /** الملخّص ①: نصّ المقرَّر ← حقائق. body: { curriculum } */
  summary_facts: async (body) => {
    const curriculum = stripImages(body.curriculum);
    if (!curriculum) {
      throw new ClaudeError(400, "نص المقرَّر فارغ — املأ تبويب المقرر أولاً");
    }
    const header = lectureHeader(body);
    return {
      skill: "fahm-alnas",
      label: `ملخص ① «${body.lecture_name || ""}»`,
      content:
        (header ? `${header}\n\n` : "") +
        `<lecture>\n${curriculum}\n</lecture>\n\n${await renderPrompt("claude_summary_facts")}`,
    };
  },

  /** الملخّص ②: الحقائق ← JSON. body: { facts } */
  summary_json: async (body) => {
    const facts = String(body.facts || "").trim();
    if (!facts) throw new ClaudeError(400, "لا حقائق — المرحلة الأولى لم تُرجع نصاً");
    return {
      skill: "text-to-json-template",
      label: `ملخص ② «${body.lecture_name || ""}»`,
      content: `<summary_text>\n${facts}\n</summary_text>\n\n${await renderPrompt("claude_summary_json")}`,
    };
  },
};

// الردّ يُفترض أنه JSON وحده، لكن سياجاً أو جملةً شاردة لا تُسقط التوليد كله
const extractJson = (text) => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
};

// أقسامٌ بالشكل الذي يحفظه المخطّط: رقم ومعرّف متسلسلان، وملاحظات فارغة
// (هي للطلاب لاحقاً — المهارة تتركها فارغة، ونضمن ذلك هنا)
const normalizeSections = (sections) =>
  sections
    .filter((s) => s && typeof s === "object")
    .map((s, i) => ({
      ...s,
      id: s.id || `section_${i + 1}`,
      number: Number.isFinite(Number(s.number)) && Number(s.number) > 0 ? Number(s.number) : i + 1,
      title: String(s.title || ""),
      content_blocks: Array.isArray(s.content_blocks) ? s.content_blocks : [],
      notes: [],
    }));

/** يحوّل ناتج المرحلة الثانية إلى أقسام، أو يرمي خطأً يحمل الردّ الخام */
const sectionsFrom = (text, stopReason) => {
  const parsed = extractJson(text);
  if (!parsed || !Array.isArray(parsed.sections) || parsed.sections.length === 0) {
    const e = new ClaudeError(
      502,
      stopReason === "max_tokens"
        ? "انقطع JSON قبل اكتماله (المحاضرة طويلة) — جرّب جهداً أقل أو قسّم المقرَّر"
        : "لم يُرجع Claude JSON صالحاً بالقالب المطلوب",
    );
    e.raw = text.slice(0, 20000);
    throw e;
  }
  return normalizeSections(parsed.sections);
};

const sendError = (res, error, where, extra = {}) => {
  if (error instanceof ClaudeError && error.raw) {
    return res.status(error.status).json({ message: error.message, raw: error.raw, ...extra });
  }
  return sendClaudeError(res, error, where);
};

// ─── عادي ─────────────────────────────────────────────────────────────────────

/**
 * أسئلة MCQ من الملخّص.
 * body: { PASSWORD, summary, number_of_questions, model, effort, lecture_name?, subject_name? }
 * الردّ: { text, requested, model, effort, stop_reason }
 */
export const Claude_Generate_Mcq = async (req, res) => {
  try {
    if (!(await allowTool(req, res))) return;
    const { model, effort } = pickModel(req.body);
    const r = await REQUESTS.mcq(req.body);
    const { text, msg } = await runClaude({ model, effort, ...r });
    return res.status(200).json({
      text,
      requested: countOf(req.body),
      model: msg.model,
      effort,
      stop_reason: msg.stop_reason,
    });
  } catch (error) {
    return sendError(res, error, "Claude_Generate_Mcq");
  }
};

/**
 * ملخّص من نصّ المقرَّر — مرحلتان على التوالي بالنموذج والجهد نفسيهما:
 *   ① fahm-alnas: نصّ المقرَّر (بلا صور) ← حقائق نصّية
 *   ② text-to-json-template: الحقائق ← JSON بالقالب الموحّد
 * body: { PASSWORD, curriculum, model, effort, lecture_name?, subject_name? }
 * الردّ: { sections, facts, model, effort, stop_reason }
 */
export const Claude_Generate_Summary = async (req, res) => {
  let factsText = "";
  try {
    if (!(await allowTool(req, res))) return;
    const { model, effort } = pickModel(req.body);

    const facts = await runClaude({ model, effort, ...(await REQUESTS.summary_facts(req.body)) });
    factsText = facts.text;
    if (!factsText) throw new ClaudeError(502, "لم تُرجع المرحلة الأولى (الحقائق) أي نص");

    const json = await runClaude({
      model,
      effort,
      ...(await REQUESTS.summary_json({ ...req.body, facts: factsText })),
    });
    return res.status(200).json({
      sections: sectionsFrom(json.text, json.msg.stop_reason),
      facts: factsText,
      model: json.msg.model,
      effort,
      stop_reason: json.msg.stop_reason,
    });
  } catch (error) {
    return sendError(res, error, "Claude_Generate_Summary", { facts: factsText });
  }
};

// ─── Batch ────────────────────────────────────────────────────────────────────

/**
 * يرسل دفعة ويعيد معرّفها فوراً.
 * body: { PASSWORD, kind: "mcq"|"summary_facts"|"summary_json", model, effort, …مدخلات النوع }
 * الردّ: { batch_id, kind }
 */
export const Claude_Batch_Submit = async (req, res) => {
  try {
    if (!(await allowTool(req, res))) return;
    const build = REQUESTS[req.body.kind];
    if (!build) throw new ClaudeError(400, `نوع غير معروف: ${req.body.kind}`);
    const { model, effort } = pickModel(req.body);
    const batch_id = await submitBatch({ model, effort, ...(await build(req.body)) });
    return res.status(200).json({ batch_id, kind: req.body.kind, effort });
  } catch (error) {
    return sendError(res, error, "Claude_Batch_Submit");
  }
};

/**
 * نتيجة دفعة: { done:false, status } أو { done:true, … } بحسب النوع:
 *   mcq → { text } · summary_facts → { text } · summary_json → { sections }
 * body: { PASSWORD, batch_id, kind }
 */
export const Claude_Batch_Result = async (req, res) => {
  try {
    if (!(await allowTool(req, res))) return;
    const { batch_id, kind } = req.body || {};
    if (!batch_id || !REQUESTS[kind]) throw new ClaudeError(400, "معرّف الدفعة أو نوعها ناقص");
    const r = await batchResult(String(batch_id));
    if (!r.done) return res.status(200).json(r);
    const base = { done: true, model: r.msg.model, stop_reason: r.msg.stop_reason };
    if (kind === "summary_json") {
      return res.status(200).json({ ...base, sections: sectionsFrom(r.text, r.msg.stop_reason) });
    }
    return res.status(200).json({ ...base, text: r.text });
  } catch (error) {
    return sendError(res, error, "Claude_Batch_Result");
  }
};
