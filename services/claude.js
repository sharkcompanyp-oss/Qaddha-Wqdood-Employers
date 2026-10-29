import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";

// ─── Claude: مصدر واحد لكل التوليد ────────────────────────────────────────────
// الأسئلة والملخّص يمرّان من هنا: النماذج المسموحة، والمهارات، والطلب
// نفسه، وترجمة الأخطاء. المفتاح وحده في الخادم (ANTHROPIC_API_KEY على
// Render)؛ النموذج والجهد يختارهما المستخدم من الواجهة مع كل توليد،
// والخادم يتحقّق منهما على القائمتين هنا فقط.

// `fallback`: هل يقبل النموذج إعادة الطلب تلقائياً على نموذجٍ بديل عند
// رفضٍ خاطئ من مصنّفات الأمان — Haiku لا يدعمها.
export const MODELS = [
  { id: "claude-opus-5-5", label: "Opus 5.5", fallback: true },
  { id: "claude-fable-5-1", label: "Fable 5.1 (الأقوى والأغلى)", fallback: true },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5 (أسرع وأرخص)", fallback: true },
  { id: "claude-haiku-5-5", label: "Haiku 5.5 (الأرخص)", fallback: false },
];
export const EFFORTS = ["low", "medium", "high", "xhigh", "max"];
export const DEFAULT_MODEL = "claude-opus-5-5";
export const DEFAULT_EFFORT = "high";

let client = null;
export const isConfigured = () => !!process.env.ANTHROPIC_API_KEY;
const getClient = () => {
  if (!isConfigured()) return null;
  if (!client) client = new Anthropic(); // يقرأ ANTHROPIC_API_KEY من البيئة
  return client;
};

// المهارات تُقرأ من القرص مرة واحدة عند أول استعمال
const skills = {};
export const loadSkill = (name) => {
  if (!skills[name]) {
    skills[name] = readFileSync(
      new URL(`./skills/${name}.md`, import.meta.url),
      "utf8",
    );
  }
  return skills[name];
};

/** خطأٌ يحمل رمز HTTP ورسالةً للمستخدم — يُرمى ويُترجَم في sendClaudeError */
export class ClaudeError extends Error {
  constructor(status, message, detail = "") {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

/** يتحقّق من اختيار الواجهة ويعيد كائن النموذج والجهد، أو يرمي 400 */
export const pickModel = (body = {}) => {
  const model = MODELS.find((m) => m.id === (body.model || DEFAULT_MODEL));
  if (!model) throw new ClaudeError(400, `نموذج غير معروف: ${body.model}`);
  const effort = body.effort || DEFAULT_EFFORT;
  if (!EFFORTS.includes(effort)) {
    throw new ClaudeError(400, `مستوى جهد غير معروف: ${effort}`);
  }
  return { model, effort };
};

/**
 * طلبٌ واحد: مهارة في system (ثابتة ← مخزَّنة مؤقتاً) + محتوى المستخدم.
 * يعيد { text, msg }. يرمي ClaudeError عند غياب المفتاح أو الرفض.
 */
export const runClaude = async ({ model, effort, skill, content, label }) => {
  const anthropic = getClient();
  if (!anthropic) {
    throw new ClaudeError(
      503,
      "مفتاح Claude غير مضبوط — أضف ANTHROPIC_API_KEY في متغيّرات الخادم على Render",
    );
  }

  const stream = anthropic.beta.messages.stream({
    model: model.id,
    max_tokens: 64000,
    output_config: { effort },
    // رفضٌ خاطئ (محتوى طبي مثلاً) يُعاد على نموذجٍ بديل داخل الطلب نفسه
    ...(model.fallback
      ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }
      : {}),
    // المهارة أكبر جزءٍ ثابت في الطلب: التوليد التالي خلال دقائق يقرؤها
    // من الذاكرة المؤقتة بعُشر السعر
    system: [
      {
        type: "text",
        text: `<skill name="${skill}">\n${loadSkill(skill)}\n</skill>`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content }],
  });
  const msg = await stream.finalMessage();

  if (msg.stop_reason === "refusal") {
    throw new ClaudeError(
      422,
      "رفض Claude معالجة هذا المحتوى",
      msg.stop_details?.explanation || "",
    );
  }

  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  console.log(
    `🤖 Claude ${label || skill}: ${msg.model} (${effort}) · in ${msg.usage?.input_tokens} ` +
      `(cache ${msg.usage?.cache_read_input_tokens || 0}) · out ${msg.usage?.output_tokens} · ${msg.stop_reason}`,
  );

  return { text, msg };
};

/** ترجمة أي خطأ إلى ردّ HTTP واضح بالعربية */
export const sendClaudeError = (res, error, where) => {
  if (error instanceof ClaudeError) {
    return res
      .status(error.status)
      .json({ message: error.message, detail: error.detail });
  }
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
    console.error(`${where}:`, error.status, error.message);
    return res
      .status(502)
      .json({ message: `خطأ من Claude (${error.status ?? "شبكة"}): ${error.message}` });
  }
  console.error(`${where}:`, error);
  return res.status(500).json({ message: "تعذّر التوليد" });
};
