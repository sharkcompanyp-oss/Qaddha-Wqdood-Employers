import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import dotenv from "dotenv";
import { allowTool } from "../services/access.js";

dotenv.config();

// ─── توليد أسئلة MCQ بـ Claude ────────────────────────────────────────────────
// المدخلات: ملخّص المحاضرة (JSON من تبويب الملخص) + مهارة mcq-doctor-style
// كاملةً + برومبت قصير بعدد الأسئلة. المخرجات نصٌّ بتنسيق «لصق الأسئلة»
// نفسه (سطر السؤال + أربعة خيارات + ✅)، فتحلّله الواجهة بالمحلّل الموجود.
//
// التشغيل: يكفي تعيين ANTHROPIC_API_KEY في متغيّرات Render — هو وحده في
// الخادم. النموذج والجهد يختارهما المستخدم من الواجهة مع كل توليد، والخادم
// يتحقّق منهما على القائمتين أدناه فقط (اسمٌ خاطئ يُرفض هنا بوضوح بدل خطأ
// غامض من Anthropic). بدون المفتاح يقول زرّ التوليد ذلك بدل أن يفشل غامضاً.

// المهارة تُقرأ مرة عند الإقلاع. هي الجزء الثابت الأكبر من الطلب (~65 ك.ب)،
// فتوضع في system مع cache_control: التوليد الثاني خلال دقائق يقرؤها من
// الذاكرة المؤقتة بعُشر السعر.
const SKILL = readFileSync(
  new URL("../services/skills/mcq-doctor-style.md", import.meta.url),
  "utf8",
);

// ما تعرضه الواجهة للاختيار. `fallback`: هل يقبل النموذج إعادة الطلب
// تلقائياً على نموذجٍ بديل عند رفضٍ خاطئ — Haiku لا يدعمها.
const MODELS = [
  { id: "claude-opus-5-5", label: "Opus 5.5", fallback: true },
  { id: "claude-fable-5-1", label: "Fable 5.1 (الأقوى والأغلى)", fallback: true },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5 (أسرع وأرخص)", fallback: true },
  { id: "claude-haiku-5-5", label: "Haiku 5.5 (الأرخص)", fallback: false },
];
const EFFORTS = ["low", "medium", "high", "xhigh", "max"];
const DEFAULT_MODEL = "claude-opus-5-5";
const DEFAULT_EFFORT = "high";
const DEFAULT_COUNT = 40;
const MAX_COUNT = 200;

let client = null;
const getClient = () => {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic(); // يقرأ ANTHROPIC_API_KEY من البيئة
  return client;
};

/** هل المفتاح مضبوط؟ — تسأله الواجهة لتفعيل الزرّ أو شرح سبب تعطيله */
export const Claude_Status = async (req, res) => {
  if (!(await allowTool(req, res))) return;
  return res.status(200).json({
    configured: !!process.env.ANTHROPIC_API_KEY,
    models: MODELS.map(({ id, label }) => ({ id, label })),
    efforts: EFFORTS,
    default_model: DEFAULT_MODEL,
    default_effort: DEFAULT_EFFORT,
    default_count: DEFAULT_COUNT,
    max_count: MAX_COUNT,
  });
};

/**
 * body: { PASSWORD, summary (أقسام الملخّص), number_of_questions,
 *         model, effort, lecture_name?, subject_name? }
 * الردّ: { text, model, stop_reason, usage }
 */
export const Claude_Generate_Mcq = async (req, res) => {
  try {
    if (!(await allowTool(req, res))) return;

    const anthropic = getClient();
    if (!anthropic) {
      return res.status(503).json({
        message:
          "مفتاح Claude غير مضبوط — أضف ANTHROPIC_API_KEY في متغيّرات الخادم على Render",
      });
    }

    const { summary, lecture_name, subject_name } = req.body || {};
    if (!Array.isArray(summary) || summary.length === 0) {
      return res
        .status(400)
        .json({ message: "الملخّص فارغ — املأ تبويب الملخص أولاً" });
    }

    const model = MODELS.find((m) => m.id === (req.body.model || DEFAULT_MODEL));
    if (!model) {
      return res.status(400).json({ message: `نموذج غير معروف: ${req.body.model}` });
    }
    const effort = req.body.effort || DEFAULT_EFFORT;
    if (!EFFORTS.includes(effort)) {
      return res.status(400).json({ message: `مستوى جهد غير معروف: ${effort}` });
    }

    const n = Math.min(
      MAX_COUNT,
      Math.max(1, Math.round(Number(req.body.number_of_questions)) || DEFAULT_COUNT),
    );

    const header = [subject_name && `المادة: ${subject_name}`, lecture_name && `المحاضرة: ${lecture_name}`]
      .filter(Boolean)
      .join("\n");

    const prompt =
      `اقرأ مهارة mcq-doctor-style بالكامل ثم نفذها على هذه المحاضرة ولا تتعدى ال ${n} سؤال` +
      // سطر التنسيق ضروري للتحليل الآلي: أي ترقيم أو عنوان يكسر كتل الأسئلة
      "\n\nأخرج الأسئلة وحدها بتنسيق المهارة: سطر السؤال ثم أربعة خيارات كلٌّ في سطر، " +
      "والصحيح مُعلَّم بـ ✅، وسطر فارغ بين كل سؤالين — بلا ترقيم ولا عناوين ولا أي كلام آخر.";

    const stream = anthropic.beta.messages.stream({
      model: model.id,
      max_tokens: 64000,
      output_config: { effort },
      // رفضٌ خاطئ من مصنّفات الأمان (محتوى طبي مثلاً) يُعاد تلقائياً على
      // نموذجٍ بديل داخل الطلب نفسه بدل أن يعود فارغاً — حيث يدعمه النموذج
      ...(model.fallback
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }
        : {}),
      system: [
        {
          type: "text",
          text: `<skill name="mcq-doctor-style">\n${SKILL}\n</skill>`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content:
            (header ? `${header}\n\n` : "") +
            `<lecture_summary>\n${JSON.stringify(summary)}\n</lecture_summary>\n\n${prompt}`,
        },
      ],
    });
    const msg = await stream.finalMessage();

    if (msg.stop_reason === "refusal") {
      return res.status(422).json({
        message: "رفض Claude توليد الأسئلة لهذه المحاضرة",
        detail: msg.stop_details?.explanation || "",
      });
    }

    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    console.log(
      `🤖 Claude MCQ «${lecture_name || ""}»: ${n} مطلوب · ${msg.model} (${effort}) · ` +
        `in ${msg.usage?.input_tokens} (cache ${msg.usage?.cache_read_input_tokens || 0}) · out ${msg.usage?.output_tokens} · ${msg.stop_reason}`,
    );

    return res.status(200).json({
      text,
      requested: n,
      model: msg.model,
      effort,
      stop_reason: msg.stop_reason,
      usage: msg.usage,
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return res
        .status(502)
        .json({ message: "مفتاح Claude مرفوض — تحقّق من ANTHROPIC_API_KEY" });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return res
        .status(429)
        .json({ message: "تجاوزت حدّ الطلبات لدى Claude — أعد المحاولة بعد قليل" });
    }
    if (error instanceof Anthropic.APIError) {
      console.error("Claude_Generate_Mcq:", error.status, error.message);
      return res
        .status(502)
        .json({ message: `خطأ من Claude (${error.status ?? "شبكة"}): ${error.message}` });
    }
    console.error("Claude_Generate_Mcq:", error);
    return res.status(500).json({ message: "تعذّر توليد الأسئلة" });
  }
};
