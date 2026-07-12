// طبقة تجريد المزوّد — تعزل بقية الوكيل عن أي نموذج/مزوّد بعينه، فيمكن التبديل
// بين Gemini و OpenRouter (أو إضافة مزوّد جديد لاحقاً) من إعدادات لوحة التحكم
// دون تغيير منطق الوكيل. كلاهما عبر HTTP (fetch مدمج في Node 18+) — لا SDK.

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODELS = "https://openrouter.ai/api/v1/models";

// قائمة احتياطية صغيرة تُستخدم فقط إن فشل جلب القائمة الحيّة من الـ API.
const FALLBACK_MODELS = {
  gemini: ["gemini-2.5-flash", "gemini-2.0-flash"],
  openrouter: ["google/gemini-2.0-flash-exp:free"],
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
  const [gemini, openrouter] = await Promise.all([
    listGeminiModels(apiKeys.gemini).catch(() => FALLBACK_MODELS.gemini),
    listOpenRouterModels().catch(() => FALLBACK_MODELS.openrouter),
  ]);
  const data = {
    gemini: gemini.length ? gemini : FALLBACK_MODELS.gemini,
    openrouter: openrouter.length ? openrouter : FALLBACK_MODELS.openrouter,
  };
  _modelsCache = { at: now, data };
  return data;
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
    return askOpenRouter({ model, prompt, key: apiKeys.openrouter });
  }
  return askGemini({ model, prompt, key: apiKeys.gemini });
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

async function askOpenRouter({ model, prompt, key }) {
  if (!key) throw new Error("مفتاح OpenRouter غير مُهيّأ (OPENROUTER_API_KEY).");
  const res = await fetch(OPENROUTER_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("OpenRouter: رد فارغ.");
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
