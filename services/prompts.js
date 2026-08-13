import PromptSetting from "../models/prompt_setting.js";
import {
  NUMBER_DEFAULTS,
  NUMBER_META,
  PROMPT_DEFAULTS,
  PROMPT_META,
} from "./prompts_defaults.js";

// ─── مصدر الموجّهات ───────────────────────────────────────────────────────────
// كل نصٍّ يُرسَل إلى نموذج يمرّ من هنا. لا موجّه محبوسٌ في الكود بعد اليوم:
// المحفوظ في القاعدة يسبق، ونسخة المصنع تسدّ مكانه إن لم يُعدَّل.
//
// ── الذاكرة المؤقتة ──
// الموجّه يُقرأ عند كل طلب إلى النموذج، والتدقيق وحده يرسل عشرات الطلبات
// للمحاضرة الواحدة — استعلامُ قاعدةٍ لكلٍّ منها هدرٌ بلا مقابل. نُبقيه
// ثلاثين ثانية، ويُبطَل فوراً عند الحفظ فلا ينتظر المحرِّر أثر تعديله.
// المهلة تحمي من نسخةٍ ثانية للخادم عدّلت الوثيقة دون علم هذه.

const TTL_MS = 30_000;
let cache = null;
let cachedAt = 0;

export const bustPromptCache = () => {
  cache = null;
  cachedAt = 0;
};

const load = async () => {
  if (cache && Date.now() - cachedAt < TTL_MS) return cache;
  let prompts = {};
  let numbers = {};
  try {
    const doc = await PromptSetting.findOne({ key: "default" }).lean();
    if (doc?.prompts) prompts = Object.fromEntries(Object.entries(doc.prompts));
    if (doc?.numbers) numbers = Object.fromEntries(Object.entries(doc.numbers));
  } catch {
    // تعذّر بلوغ القاعدة لا يُسكت الوكلاء: نعمل بنسخة المصنع
  }
  cache = { prompts, numbers };
  cachedAt = Date.now();
  return cache;
};

/** نصّ موجّه بعينه — المحفوظ إن وُجد وإلا الافتراضي */
export const getPrompt = async (name) => {
  const { prompts } = await load();
  const saved = prompts[name];
  if (typeof saved === "string" && saved.trim()) return saved;
  return PROMPT_DEFAULTS[name] || "";
};

/** عددٌ بعينه — مقيَّدٌ بحدّيه فقيمةٌ شاردة لا تُعطّل الوكيل */
export const getNumber = async (name) => {
  const { numbers } = await load();
  const meta = NUMBER_META[name] || {};
  const fallback = NUMBER_DEFAULTS[name];
  const v = Number(numbers[name]);
  if (!Number.isFinite(v)) return fallback;
  const lo = Number.isFinite(meta.min) ? meta.min : -Infinity;
  const hi = Number.isFinite(meta.max) ? meta.max : Infinity;
  return Math.min(hi, Math.max(lo, Math.round(v)));
};

/**
 * يستبدل `{{name}}` بقيمتها.
 *
 * استبدالٌ حرفيّ لا تنفيذ: نصّ الموجّه صار بيد المحرِّر، ولو مُرّر إلى
 * قالبٍ يُقيَّم (template literal أو Function) لصار كل حقلٍ في اللوحة
 * ثغرةَ تنفيذ على الخادم.
 *
 * المتغيّر الذي لا قيمة له يُترك كما هو ظاهراً في الموجّه — إخفاؤه يجعل
 * الخلل صامتاً، وظهوره يقول للمحرِّر إنه كتب اسماً لا نعرفه.
 */
export const fill = (template, vars = {}) => {
  let out = String(template || "");
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(v === undefined || v === null ? "" : String(v));
  }
  return out;
};

/** موجّهٌ جاهز: يُقرأ ثم تُملأ متغيّراته */
export const renderPrompt = async (name, vars = {}) =>
  fill(await getPrompt(name), vars);

/** كل شيء دفعةً واحدة — للّوحة */
export const readAll = async () => {
  const { prompts, numbers } = await load();
  const out = {};
  for (const name of Object.keys(PROMPT_DEFAULTS)) {
    const saved = prompts[name];
    const isCustom = typeof saved === "string" && saved.trim().length > 0;
    out[name] = {
      value: isCustom ? saved : PROMPT_DEFAULTS[name],
      default: PROMPT_DEFAULTS[name],
      custom: isCustom,
      ...PROMPT_META[name],
    };
  }
  const nums = {};
  for (const name of Object.keys(NUMBER_DEFAULTS)) {
    const v = Number(numbers[name]);
    const isCustom = Number.isFinite(v) && v !== NUMBER_DEFAULTS[name];
    nums[name] = {
      value: Number.isFinite(v) ? v : NUMBER_DEFAULTS[name],
      default: NUMBER_DEFAULTS[name],
      custom: isCustom,
      ...NUMBER_META[name],
    };
  }
  return { prompts: out, numbers: nums };
};

export { PROMPT_DEFAULTS, PROMPT_META, NUMBER_DEFAULTS, NUMBER_META };
