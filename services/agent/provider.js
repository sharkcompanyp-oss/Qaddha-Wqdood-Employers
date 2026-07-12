// طبقة تجريد المزوّد — تعزل بقية الوكيل عن أي نموذج/مزوّد بعينه، فيمكن التبديل
// بين Gemini و OpenRouter (أو إضافة مزوّد جديد لاحقاً) من إعدادات لوحة التحكم
// دون تغيير منطق الوكيل. كلاهما عبر HTTP (fetch مدمج في Node 18+) — لا SDK.

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODELS = "https://openrouter.ai/api/v1/models";
// Dahl Inference — OpenAI-compatible (نفس صيغة OpenRouter)
const DAHL_BASE = "https://inference.dahl.global/v1/chat/completions";
const DAHL_MODELS = "https://inference.dahl.global/v1/models";

// قائمة احتياطية صغيرة تُستخدم فقط إن فشل جلب القائمة الحيّة من الـ API.
const FALLBACK_MODELS = {
  gemini: ["gemini-2.5-flash", "gemini-2.0-flash"],
  openrouter: ["google/gemini-2.0-flash-exp:free"],
  dahl: ["zai-org/GLM-5.2-FP8", "MiniMaxAI/MiniMax-M2.7"],
};

// كاش بسيط للقوائم الحيّة (تُجلب كل ساعة) حتى لا نضرب الـ API في كل طلب.
let _modelsCache = { at: 0, data: null };

// يجلب كل النماذج المتاحة فعلياً من الـ API مباشرة (Gemini + OpenRouter) — فتظهر
// كل النماذج الجديدة تلقائياً دون تعديل الكود. يقع على القائمة الاحتياطية عند الفشل.
export async function listAvailableModels(apiKeys = {}) {
  const now = Date.now();
  if (_modelsCache.data && now - _modelsCache.at < 3600_000) {
    return _modelsCache.data;
  }
  const [gemini, openrouter, dahl] = await Promise.all([
    listGeminiModels(apiKeys.gemini).catch(() => FALLBACK_MODELS.gemini),
    listOpenRouterModels().catch(() => FALLBACK_MODELS.openrouter),
    listDahlModels().catch(() => FALLBACK_MODELS.dahl),
  ]);
  const data = {
    gemini: gemini.length ? gemini : FALLBACK_MODELS.gemini,
    openrouter: openrouter.length ? openrouter : FALLBACK_MODELS.openrouter,
    dahl: dahl.length ? dahl : FALLBACK_MODELS.dahl,
  };
  _modelsCache = { at: now, data };
  return data;
}

async function listDahlModels() {
  const res = await fetch(DAHL_MODELS);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.data || [])
    .map((m) => m.id)
    .filter(Boolean)
    .sort();
}

async function listGeminiModels(key) {
  if (!key) return [];
  const res = await fetch(`${GEMINI_BASE}?key=${key}&pageSize=1000`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.models || [])
    // نُبقي فقط النماذج التي تدعم توليد المحتوى، ونحذف البادئة "models/"
    .filter((m) =>
      (m.supportedGenerationMethods || []).includes("generateContent"),
    )
    .map((m) => (m.name || "").replace(/^models\//, ""))
    .filter(Boolean)
    .sort();
}

async function listOpenRouterModels() {
  const res = await fetch(OPENROUTER_MODELS);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.data || [])
    .map((m) => m.id)
    .filter(Boolean)
    .sort();
}

// يرسل مطالبة نصية ويعيد النص الخام. يرمي خطأً واضحاً عند الفشل ليُلتقط أعلى.
export async function askText({ provider, model, prompt, apiKeys }) {
  if (provider === "openrouter") {
    return askOpenAICompat({
      label: "OpenRouter",
      url: OPENROUTER_BASE,
      envName: "OPENROUTER_API_KEY",
      model,
      prompt,
      key: apiKeys.openrouter,
    });
  }
  if (provider === "dahl") {
    return askOpenAICompat({
      label: "Dahl",
      url: DAHL_BASE,
      envName: "DAHL_API_KEY",
      model,
      prompt,
      key: apiKeys.dahl,
    });
  }
  return askGemini({ model, prompt, key: apiKeys.gemini });
}

// أي مزوّد متوافق مع OpenAI (OpenRouter / Dahl / …) — نفس صيغة الطلب والرد.
async function askOpenAICompat({ label, url, envName, model, prompt, key }) {
  if (!key) throw new Error(`مفتاح ${label} غير مُهيّأ (${envName}).`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      // بعض المزوّدين (مثل Dahl خلف Cloudflare) يحجبون الطلبات بلا User-Agent
      // معتبرينها بوتاً؛ نرسل UA متصفح لتمرّ. وHeaders موصى بها من OpenRouter.
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "HTTP-Referer": "https://qaddha-wqdood-employers.onrender.com",
      "X-Title": "Qaddha Complaint Agent",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${label} ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error(`${label}: رد فارغ.`);
  return text;
}

async function askGemini({ model, prompt, key }) {
  if (!key) throw new Error("مفتاح Gemini غير مُهيّأ (GEMINI_API_KEY).");
  const url = `${GEMINI_BASE}/${model}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
  if (!text) throw new Error("Gemini: رد فارغ.");
  return text;
}

// يستخرج كائن JSON من نص النموذج (يتسامح مع أسوار markdown ونص محيط).
export function extractJson(text) {
  let t = (text || "").trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  }
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end !== -1) t = t.slice(start, end + 1);
  return JSON.parse(t);
}
