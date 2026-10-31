import AiCost from "../models/ai_cost.js";
import PriceSetting from "../models/price_setting.js";
import { employerOf, isPanel } from "./access.js";

// ─── تكاليف الذكاء الاصطناعي ──────────────────────────────────────────────────
// لا مزوّد يعيد الفاتورة بالدولار مع الطلب، لكن كلّاً منهم يعيد **الوحدات التي
// يحاسب عليها** بالضبط: Claude الـtokens بأنواعها، Gemini الـtokens
// (usageMetadata)، Mistral الصفحات (usage_info). والفاتورة ليست إلا هذه
// الوحدات × السعر الرسمي — فالضرب هنا هو حسابه هو، لا تقدير.
//
// الأسعار بالدولار لكل مليون token (أو لكل ألف صفحة في Mistral)، من صفحات
// الأسعار الرسمية، وقابلة للتعديل من اللوحة: المزوّد يغيّر سعره ولا نغيّر الكود.
//
// التسجيل لا يعطّل الطلب أبداً: يجري في الخلفية، وإخفاقه يُطبع ولا يُرمى.

/** نماذج طويلة السياق تتغيّر أسعارها فوق عتبةٍ من الإدخال: long_* */
export const DEFAULT_PRICES = {
  claude: {
    "claude-opus-5-5": { input: 4, output: 20, cache_read: 0.2 },
    "claude-fable-5-1": { input: 10, output: 50, cache_read: 0.25 },
    "claude-sonnet-5-5": { input: 2, output: 10, cache_read: 0.2 },
    "claude-haiku-5-5": {
      input: 0.1,
      output: 0.5,
      cache_read: 0.01,
      long_above: 100000,
      long_input: 0.5,
      long_output: 2.5,
      long_cache_read: 0.05,
    },
    // أهداف الرجوع التلقائي عند رفضٍ خاطئ — قد يُفوتَر الطلب عليها
    "claude-opus-5": { input: 5, output: 25, cache_read: 0.5 },
    "claude-opus-4-8": { input: 5, output: 25, cache_read: 0.5 },
  },
  /** مضاعفات على سعر الإدخال/الكل */
  claude_rules: { cache_write_5m: 1.25, cache_write_1h: 2, batch: 0.5 },
  gemini: {
    "gemini-3.6-flash": { input: 0.75, input_audio: 0.75, output: 3.75, cache_read: 0.075 },
    "gemini-3.8-flash": { input: 0.75, input_audio: 0.75, output: 3.75, cache_read: 0.075 },
    "gemini-3.5-flash-lite": { input: 0.3, input_audio: 0.3, output: 2.5, cache_read: 0.03 },
    "gemini-3.1-flash-lite": { input: 0.25, input_audio: 0.5, output: 1.5, cache_read: 0.025 },
    "gemini-3-flash-preview": { input: 0.5, input_audio: 1, output: 3, cache_read: 0.05 },
    "gemini-3.1-pro-preview": {
      input: 2,
      output: 12,
      cache_read: 0.2,
      long_above: 200000,
      long_input: 4,
      long_output: 18,
      long_cache_read: 0.4,
    },
    "gemini-2.5-pro": {
      input: 1.25,
      output: 10,
      cache_read: 0.125,
      long_above: 200000,
      long_input: 2.5,
      long_output: 15,
      long_cache_read: 0.25,
    },
    "gemini-2.5-flash": { input: 0.3, input_audio: 1, output: 2.5, cache_read: 0.03 },
    "gemini-2.5-flash-lite": { input: 0.1, input_audio: 0.3, output: 0.4, cache_read: 0.01 },
  },
  mistral: {
    "mistral-ocr-latest": { per_1000_pages: 4 },
  },
};

// ─── الأسعار ──────────────────────────────────────────────────────────────────
// تُقرأ مع كل طلب، فتُبقى ثلاثين ثانية كالموجّهات وتُبطل فوراً عند الحفظ.

const TTL_MS = 30_000;
let cache = null;
let cachedAt = 0;

export const bustPriceCache = () => {
  cache = null;
  cachedAt = 0;
};

/** المحفوظ فوق المصنع، مزوّداً مزوّداً — نموذجٌ أُضيف للمصنع لاحقاً يظهر وحده */
export const mergePrices = (saved) => {
  const out = {};
  for (const k of Object.keys(DEFAULT_PRICES)) {
    out[k] = { ...DEFAULT_PRICES[k], ...((saved && saved[k]) || {}) };
  }
  return out;
};

export const getPrices = async () => {
  if (cache && Date.now() - cachedAt < TTL_MS) return cache;
  let saved = null;
  try {
    saved = (await PriceSetting.findOne({ key: "default" }).lean())?.prices || null;
  } catch {
    // القاعدة بعيدة: أسعار المصنع خيرٌ من ترك الطلب بلا كلفة
  }
  cache = mergePrices(saved);
  cachedAt = Date.now();
  return cache;
};

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** سعر النموذج بالمعرّف الذي أعاده المزوّد، ثم بالذي طُلب */
const priceOf = (table, ...ids) => {
  for (const id of ids) {
    const p = id && table?.[String(id).replace(/^models\//, "")];
    if (p) return p;
  }
  return null;
};

/** أسعار الشريحة: الطويلة إن تجاوز الإدخال عتبتها */
const tier = (p, promptTokens) => {
  if (p.long_above && promptTokens > Number(p.long_above)) {
    return {
      input: num(p.long_input ?? p.input),
      input_audio: num(p.long_input ?? p.input_audio ?? p.input),
      output: num(p.long_output ?? p.output),
      cache_read: num(p.long_cache_read ?? p.cache_read),
    };
  }
  return {
    input: num(p.input),
    input_audio: num(p.input_audio ?? p.input),
    output: num(p.output),
    cache_read: num(p.cache_read),
  };
};

// ─── Claude ───────────────────────────────────────────────────────────────────
// رفضٌ قبل أي مخرَج لا يُفوتَر إلا في هذه الفئات (صفحة «How refusals are billed»)
const BILLED_REFUSALS = new Set(["bio", "frontier_llm", "reasoning_extraction"]);

/** وحدات محاولةٍ واحدة كما يعدّها Claude */
const claudeUnits = (u = {}) => {
  const cc = u.cache_creation || {};
  const w1h = num(cc.ephemeral_1h_input_tokens);
  // التفصيل غائب في بعض الحقول (iterations) — كل الكتابة عندنا بمهلة ٥ دقائق
  const w5m =
    cc.ephemeral_5m_input_tokens !== undefined
      ? num(cc.ephemeral_5m_input_tokens)
      : Math.max(0, num(u.cache_creation_input_tokens) - w1h);
  return {
    input: num(u.input_tokens),
    cache_write_5m: w5m,
    cache_write_1h: w1h,
    cache_read: num(u.cache_read_input_tokens),
    output: num(u.output_tokens),
  };
};

const sumUnits = (list) =>
  list.reduce((a, u) => {
    for (const [k, v] of Object.entries(u)) a[k] = (a[k] || 0) + num(v);
    return a;
  }, {});

/**
 * كلفة رسالة Claude: مجموع محاولاتها.
 * مع الرجوع التلقائي، `usage.iterations` سجلّ كل محاولة بنموذجها، والـusage
 * العلوي يصف الأخيرة وحدها — فالحساب على المحاولات إن وُجدت.
 * يعيد { units, cost_usd, model } — cost_usd = null إن جُهل سعر نموذجٍ ما.
 */
export const claudeCost = (msg, prices, { batch = false } = {}) => {
  const table = prices.claude || {};
  const rules = prices.claude_rules || {};
  const usage = msg?.usage || {};
  const fallbacks = (msg?.content || []).filter((b) => b?.type === "fallback");

  const attempts = Array.isArray(usage.iterations) && usage.iterations.length
    ? usage.iterations.map((it) => {
        // المحاولة التي رفضت: فئتها في كتلة fallback التي غادرتها
        const left = fallbacks.find((b) => b?.from?.model === it.model);
        return {
          model: it.model || msg.model,
          units: claudeUnits(it),
          refusedCategory: it.type === "message" && left ? left.trigger?.category ?? null : undefined,
        };
      })
    : [
        {
          model: msg.model,
          units: claudeUnits(usage),
          refusedCategory:
            msg.stop_reason === "refusal" ? msg.stop_details?.category ?? null : undefined,
        },
      ];

  let total = 0;
  let unknown = false;
  for (const a of attempts) {
    // رفضٌ قبل أي مخرَج خارج الفئات المفوتَرة: مجاني
    if (a.refusedCategory !== undefined && a.units.output === 0 && !BILLED_REFUSALS.has(a.refusedCategory)) {
      continue;
    }
    const p = priceOf(table, a.model);
    if (!p) {
      unknown = true;
      continue;
    }
    const u = a.units;
    const t = tier(p, u.input + u.cache_write_5m + u.cache_write_1h + u.cache_read);
    const cost =
      u.input * t.input +
      u.cache_write_5m * t.input * num(rules.cache_write_5m ?? 1.25) +
      u.cache_write_1h * t.input * num(rules.cache_write_1h ?? 2) +
      u.cache_read * t.cache_read +
      u.output * t.output;
    total += (cost / 1e6) * (batch ? num(rules.batch ?? 0.5) : 1);
  }

  const units = sumUnits(attempts.map((a) => a.units));
  if (attempts.length > 1) units.attempts = attempts.map((a) => a.model).join(" ← ");
  return { units, cost_usd: unknown ? null : total, model: msg.model };
};

// ─── Gemini ───────────────────────────────────────────────────────────────────

const modality = (details, kind) =>
  (Array.isArray(details) ? details : [])
    .filter((d) => String(d?.modality).toUpperCase() === kind)
    .reduce((s, d) => s + num(d.tokenCount), 0);

/** وحدات usageMetadata: الإدخال مفصولٌ صوتاً ونصّاً، والمخزَّن ضمنياً على حدة */
export const geminiUnits = (meta = {}) => {
  const prompt = num(meta.promptTokenCount) + num(meta.toolUsePromptTokenCount);
  const cached = num(meta.cachedContentTokenCount);
  const audio = Math.max(
    0,
    modality(meta.promptTokensDetails, "AUDIO") - modality(meta.cacheTokensDetails, "AUDIO"),
  );
  return {
    input: Math.max(0, prompt - cached - audio),
    input_audio: audio,
    cache_read: cached,
    output: num(meta.candidatesTokenCount),
    thinking: num(meta.thoughtsTokenCount),
    prompt_total: prompt,
  };
};

export const geminiCost = (units, p) => {
  if (!p) return null;
  const t = tier(p, units.prompt_total);
  return (
    (units.input * t.input +
      units.input_audio * t.input_audio +
      units.cache_read * t.cache_read +
      // التفكير يُفوتَر بسعر المخرَج
      (units.output + units.thinking) * t.output) /
    1e6
  );
};

// ─── التسجيل ──────────────────────────────────────────────────────────────────

/** سياق الطلب: المادة والمحاضرة كما أرسلتهما الواجهة، والخطوة من الخادم */
export const costCtx = (req, step) => {
  const c = req?.body?.cost || {};
  return {
    req,
    step,
    exam_id: c.exam_id ? String(c.exam_id) : null,
    lecture_id: c.lecture_id ? String(c.lecture_id) : null,
  };
};

const whoOf = async (req) => {
  if (!req || isPanel(req)) return { by_kind: "panel", by_id: null, by_name: "" };
  const e = await employerOf(req);
  return e
    ? { by_kind: "employer", by_id: String(e._id), by_name: e.name || "" }
    : { by_kind: "unknown", by_id: null, by_name: "" };
};

const save = async (ctx, doc) => {
  const row = {
    exam_id: ctx.exam_id,
    lecture_id: ctx.lecture_id,
    step: ctx.step,
    ...(await whoOf(ctx.req)),
    ...doc,
    created_at: new Date(),
  };
  if (row.ref) {
    // الطلب الواحد مرةً واحدة — إعادة السؤال عن دفعةٍ لا تضاعف كلفتها
    await AiCost.updateOne({ ref: row.ref }, { $setOnInsert: row }, { upsert: true });
  } else {
    await AiCost.create(row);
  }
};

/** في الخلفية: لا ينتظره الردّ ولا يُسقطه خطؤه */
const fire = (label, work) => {
  Promise.resolve()
    .then(work)
    .catch((e) => console.error(`💸 تعذّر تسجيل كلفة ${label}:`, e.message));
};

export const recordClaude = (ctx, msg, { batch = false, ref } = {}) =>
  fire(`Claude ${ctx?.step}`, async () => {
    const prices = await getPrices();
    const { units, cost_usd, model } = claudeCost(msg, prices, { batch });
    await save(ctx, {
      provider: "claude",
      model,
      mode: batch ? "batch" : "regular",
      units,
      cost_usd,
      ref: ref || msg?.id,
    });
  });

/** data: ردّ generateContent كاملاً · requested: النموذج المطلوب */
export const recordGemini = (ctx, data, requested) =>
  fire(`Gemini ${ctx?.step}`, async () => {
    const meta = data?.usageMetadata;
    if (!meta) return;
    const prices = await getPrices();
    const model = String(data?.modelVersion || requested || "");
    const units = geminiUnits(meta);
    await save(ctx, {
      provider: "gemini",
      model,
      units,
      cost_usd: geminiCost(units, priceOf(prices.gemini, model, requested)),
      ref: data?.responseId ? `gemini:${data.responseId}` : undefined,
    });
  });

export const recordMistral = (ctx, { pages, model, requested, ref }) =>
  fire(`Mistral ${ctx?.step}`, async () => {
    const prices = await getPrices();
    const p = priceOf(prices.mistral, model, requested);
    await save(ctx, {
      provider: "mistral",
      model: model || requested || "",
      units: { pages },
      cost_usd: p ? (pages * num(p.per_1000_pages)) / 1000 : null,
      ref,
    });
  });

/**
 * بعد ضبط سعرٍ كان غائباً: يملأ كلفة الطلبات التي سُجّلت بلا سعر.
 * الطلبات المسعَّرة لا تُمسّ — كلفتها كلفة يومها.
 */
export const fillMissingCosts = async () => {
  const prices = await getPrices();
  const rows = await AiCost.find({ cost_usd: null }).lean();
  let filled = 0;
  for (const r of rows) {
    let cost = null;
    const u = r.units || {};
    if (r.provider === "gemini") {
      cost = geminiCost(u, priceOf(prices.gemini, r.model));
    } else if (r.provider === "mistral") {
      const p = priceOf(prices.mistral, r.model);
      cost = p ? (num(u.pages) * num(p.per_1000_pages)) / 1000 : null;
    } else if (r.provider === "claude" && !u.attempts) {
      cost = claudeCost(
        {
          model: r.model,
          usage: {
            input_tokens: u.input,
            cache_creation: {
              ephemeral_5m_input_tokens: u.cache_write_5m,
              ephemeral_1h_input_tokens: u.cache_write_1h,
            },
            cache_read_input_tokens: u.cache_read,
            output_tokens: u.output,
          },
        },
        prices,
        { batch: r.mode === "batch" },
      ).cost_usd;
    }
    if (cost !== null) {
      // eslint-disable-next-line no-await-in-loop
      await AiCost.updateOne({ _id: r._id }, { $set: { cost_usd: cost } });
      filled++;
    }
  }
  return filled;
};
