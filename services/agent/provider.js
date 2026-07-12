// طبقة تجريد المزوّد — تعزل بقية الوكيل عن أي نموذج/مزوّد بعينه، فيمكن التبديل
// بين Gemini و OpenRouter (أو إضافة مزوّد جديد لاحقاً) من إعدادات لوحة التحكم
// دون تغيير منطق الوكيل. كلاهما عبر HTTP (fetch مدمج في Node 18+) — لا SDK.

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1/chat/completions";

// النماذج المتاحة للاختيار من الواجهة (قابلة للتوسعة بسهولة)
export const AVAILABLE_MODELS = {
  gemini: [
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-1.5-flash",
  ],
  openrouter: [
    "google/gemini-2.0-flash-exp:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "nvidia/llama-3.1-nemotron-70b-instruct:free",
    "openai/gpt-oss-120b:free",
    "deepseek/deepseek-chat-v3.1:free",
  ],
};

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
