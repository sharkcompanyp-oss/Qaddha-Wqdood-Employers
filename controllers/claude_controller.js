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
  sendClaudeError,
  ClaudeError,
} from "../services/claude.js";

dotenv.config();

// ─── التوليد بـ Claude: أسئلة MCQ وملخّص ──────────────────────────────────────
// كل طلب = مهارة (system) + محتوى المحاضرة + موجّه قصير. الموجّهات في
// «الإعدادات ← الموجّهات» (claude_mcq و claude_summary_*) قابلة للتعديل،
// وتشترط أن يكون المخرج هو المطلوب وحده: الواجهة تحلّله آلياً، وأي مقدمة
// أو خاتمة تكسر التحليل.

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

/**
 * أسئلة MCQ من الملخّص.
 * body: { PASSWORD, summary (أقسام), number_of_questions, model, effort,
 *         lecture_name?, subject_name? }
 * الردّ: { text, requested, model, effort, stop_reason }
 */
export const Claude_Generate_Mcq = async (req, res) => {
  try {
    if (!(await allowTool(req, res))) return;
    const { model, effort } = pickModel(req.body);

    const { summary } = req.body || {};
    if (!Array.isArray(summary) || summary.length === 0) {
      throw new ClaudeError(400, "الملخّص فارغ — املأ تبويب الملخص أولاً");
    }

    const n = Math.min(
      MAX_COUNT,
      Math.max(1, Math.round(Number(req.body.number_of_questions)) || DEFAULT_COUNT),
    );
    const header = lectureHeader(req.body);
    const prompt = await renderPrompt("claude_mcq", { count: n });

    const { text, msg } = await runClaude({
      model,
      effort,
      skill: "mcq-doctor-style",
      label: `MCQ «${req.body.lecture_name || ""}» (${n})`,
      content:
        (header ? `${header}\n\n` : "") +
        `<lecture_summary>\n${JSON.stringify(summary)}\n</lecture_summary>\n\n${prompt}`,
    });

    return res.status(200).json({
      text,
      requested: n,
      model: msg.model,
      effort,
      stop_reason: msg.stop_reason,
    });
  } catch (error) {
    return sendClaudeError(res, error, "Claude_Generate_Mcq");
  }
};

// الصور لا تُرسل: Claude يقرأ نصّاً، ورابط R2 بلا معنى له ويأكل من السياق.
// ماركداون الصورة ‎![شكل](رابط)‎ ووسوم <img> كلاهما يُحذف.
const stripImages = (text) =>
  String(text || "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

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

/**
 * ملخّص من نصّ المقرَّر — مرحلتان على التوالي بالنموذج والجهد نفسيهما:
 *   ① fahm-alnas: نصّ المقرَّر (بلا صور) ← حقائق نصّية
 *   ② text-to-json-template: الحقائق ← JSON بالقالب الموحّد
 * body: { PASSWORD, curriculum, model, effort, lecture_name?, subject_name? }
 * الردّ: { sections, facts, model, effort, stop_reason }
 */
export const Claude_Generate_Summary = async (req, res) => {
  try {
    if (!(await allowTool(req, res))) return;
    const { model, effort } = pickModel(req.body);

    const curriculum = stripImages(req.body.curriculum);
    if (!curriculum) {
      throw new ClaudeError(400, "نص المقرَّر فارغ — املأ تبويب المقرر أولاً");
    }
    const header = lectureHeader(req.body);
    const lecture = req.body.lecture_name || "";

    // ① الحقائق
    const facts = await runClaude({
      model,
      effort,
      skill: "fahm-alnas",
      label: `ملخص ① «${lecture}»`,
      content:
        (header ? `${header}\n\n` : "") +
        `<lecture>\n${curriculum}\n</lecture>\n\n${await renderPrompt("claude_summary_facts")}`,
    });
    if (!facts.text) {
      throw new ClaudeError(502, "لم تُرجع المرحلة الأولى (الحقائق) أي نص");
    }

    // ② القالب
    const json = await runClaude({
      model,
      effort,
      skill: "text-to-json-template",
      label: `ملخص ② «${lecture}»`,
      content:
        `<summary_text>\n${facts.text}\n</summary_text>\n\n` +
        (await renderPrompt("claude_summary_json")),
    });

    const parsed = extractJson(json.text);
    if (!parsed || !Array.isArray(parsed.sections) || parsed.sections.length === 0) {
      return res.status(502).json({
        message:
          json.msg.stop_reason === "max_tokens"
            ? "انقطع JSON قبل اكتماله (المحاضرة طويلة) — جرّب جهداً أقل أو قسّم المقرَّر"
            : "لم يُرجع Claude JSON صالحاً بالقالب المطلوب",
        facts: facts.text,
        raw: json.text.slice(0, 20000),
      });
    }

    return res.status(200).json({
      sections: normalizeSections(parsed.sections),
      facts: facts.text,
      model: json.msg.model,
      effort,
      stop_reason: json.msg.stop_reason,
    });
  } catch (error) {
    return sendClaudeError(res, error, "Claude_Generate_Summary");
  }
};
