import dotenv from "dotenv";

dotenv.config();

// ─── تفريغ الصوت إلى نصّ مقرَّر ────────────────────────────────────────────────
// منقول عن audio-transcriber (app.py) بنفس منطقه: الملف الصغير يُرسَل مباشرةً
// والكبير عبر Files API ثم يُحذف من خوادم Google.
//
// الفارق الوحيد: المخرَج ماركداون لا نصّاً خاماً — لأن الناتج هنا يصير **نصّ
// المقرَّر** ويمرّ على ما يمرّ عليه سواه: عارض الماركداون، والتدقيق الإملائي،
// وتوليد البطاقات. نصٌّ بلا عناوين يصير كتلةً واحدة لا يُقرأ منها شيء.

const GEMINI = "https://generativelanguage.googleapis.com/v1beta";
const INLINE_LIMIT = 18 * 1024 * 1024; // نفس عتبة الأصل

const DEFAULT_PROMPT = `فرّغ هذا التسجيل الصوتي إلى نصّ عربي مكتوب بدقة عالية، وأخرجه بصيغة ماركداون.

التعليمات:
- اكتب النصّ كاملاً كما هو منطوق دون تلخيص أو حذف.
- استخدم علامات الترقيم المناسبة وقسّم النصّ إلى فقرات مترابطة.
- صحّح الأخطاء اللفظية البسيطة والتلعثم واحذف الكلمات المكرّرة بلا داعٍ.
- اكتب المصطلحات العلمية والأجنبية بشكلها الصحيح.

تنسيق الماركداون:
- عنوان المحاضرة بـ# إن ذُكر في التسجيل.
- كل محور رئيسي بـ## وما تفرّع عنه بـ###.
- التعدادات التي ينطقها المحاضر («أولاً… ثانياً…») اكتبها قوائم بـ-.
- الكلمة التي يشدّد عليها أو يقول «هذا مهم» اجعلها **غامقة**.
- إن أملى جدولاً أو مقارنة، اكتبها جدول ماركداون.

لا تضف أي تعليق أو مقدّمة أو خاتمة من عندك — أخرج النصّ المفرّغ وحده.`;

// نماذج لا تصلح للصوت (توليد صور/أصوات/تضمين…) — نفس قائمة الأصل
const SKIP = [
  "-tts",
  "-image",
  "image-",
  "embedding",
  "gemma",
  "lyria",
  "veo",
  "imagen",
];

const guard = (req, res) => {
  const { PASSWORD } = req.body || {};
  if (!PASSWORD || PASSWORD !== process.env.PASSWORD) {
    res.status(401).json({ message: "غير مصرّح" });
    return false;
  }
  return true;
};

/** النماذج التي تقبل الصوت — القائمة من الحساب لا مكتوبة يدوياً */
export const Transcribe_Models = async (req, res) => {
  try {
    if (!guard(req, res)) return;
    const key = process.env.GEMINI_API_KEY;
    if (!key) return res.status(200).json({ ready: false, models: [] });

    const r = await fetch(`${GEMINI}/models?key=${key}&pageSize=100`);
    if (!r.ok) return res.status(200).json({ ready: true, models: [] });
    const data = await r.json();
    const models = (data.models || [])
      .filter((m) =>
        (m.supportedGenerationMethods || []).includes("generateContent"),
      )
      .map((m) => String(m.name).replace(/^models\//, ""))
      .filter((n) => /gemini/i.test(n))
      .filter((n) => !SKIP.some((b) => n.toLowerCase().includes(b)))
      .sort();
    return res.status(200).json({
      ready: true,
      models,
      current: process.env.GEMINI_MODEL || models[0] || "",
    });
  } catch (error) {
    return res
      .status(200)
      .json({ ready: false, models: [], note: error.message });
  }
};

export const Transcribe_Audio = async (req, res) => {
  try {
    if (!guard(req, res)) return;
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return res
        .status(503)
        .json({ message: "GEMINI_API_KEY غير مضبوط في الخادم" });
    }

    const { audioB64, mimeType, fileName, model, prompt } = req.body;
    if (!audioB64) return res.status(400).json({ message: "الملف الصوتي ناقص" });
    if (!model) return res.status(400).json({ message: "لم تُحدَّد النموذج" });

    const bytes = Buffer.from(audioB64, "base64");
    if (!bytes.length) return res.status(400).json({ message: "الملف فارغ" });

    const use = String(model).replace(/^models\//, "");
    const mime = mimeType || "audio/mpeg";
    const text = String(prompt || "").trim() || DEFAULT_PROMPT;

    let parts;
    let uploadedName = null;

    if (bytes.length < INLINE_LIMIT) {
      parts = [{ text }, { inline_data: { mime_type: mime, data: audioB64 } }];
    } else {
      // الرفع بالبروتوكول القابل للاستئناف: خطوة بدءٍ ثم رفع البايتات
      const start = await fetch(`${GEMINI}/files?key=${key}`, {
        method: "POST",
        headers: {
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": String(bytes.length),
          "X-Goog-Upload-Header-Content-Type": mime,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          file: { display_name: fileName || "audio" },
        }),
      });
      const uploadUrl = start.headers.get("x-goog-upload-url");
      if (!uploadUrl) {
        const t = await start.text();
        return res.status(502).json({
          message: "تعذّر بدء رفع الملف الصوتي",
          detail: t.slice(0, 300),
        });
      }
      const up = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Length": String(bytes.length),
          "X-Goog-Upload-Offset": "0",
          "X-Goog-Upload-Command": "upload, finalize",
        },
        body: bytes,
      });
      if (!up.ok) {
        const t = await up.text();
        return res
          .status(502)
          .json({ message: "فشل رفع الملف الصوتي", detail: t.slice(0, 300) });
      }
      const info = await up.json();
      const file = info?.file || info;
      uploadedName = file?.name || null;

      // الملف يُعالَج قبل أن يصير قابلاً للاستعمال — ننتظر جاهزيته
      let state = file?.state;
      const uri = file?.uri;
      for (let i = 0; i < 30 && state === "PROCESSING"; i++) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 2000));
        // eslint-disable-next-line no-await-in-loop
        const chk = await fetch(`${GEMINI}/${uploadedName}?key=${key}`);
        // eslint-disable-next-line no-await-in-loop
        const j = await chk.json();
        state = j?.state;
      }
      if (state !== "ACTIVE") {
        return res
          .status(502)
          .json({ message: `الملف الصوتي لم يجهز (${state || "?"})` });
      }
      parts = [{ text }, { file_data: { mime_type: mime, file_uri: uri } }];
    }

    const r = await fetch(`${GEMINI}/models/${use}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 65536 },
      }),
    });

    const raw = await r.text();

    // ننظّف ملف Google في كل الأحوال — لا نترك تسجيلات المقرَّر على خوادمهم
    if (uploadedName) {
      fetch(`${GEMINI}/${uploadedName}?key=${key}`, { method: "DELETE" }).catch(
        () => {},
      );
    }

    if (!r.ok) {
      let retryAfter = null;
      const m = raw.match(/"retryDelay"\s*:\s*"(\d+)s"/);
      if (m) retryAfter = Number(m[1]) + 2;
      return res.status(r.status).json({
        message:
          r.status === 429
            ? "تجاوزتَ حصة الطلبات — انتظر ثم أعد"
            : `فشل التفريغ (${r.status})`,
        retryAfter,
        detail: raw.slice(0, 300),
      });
    }

    const data = JSON.parse(raw);
    const cand = data?.candidates?.[0];
    const out = cand?.content?.parts?.map((p) => p.text || "").join("") || "";
    if (!out.trim()) {
      return res
        .status(502)
        .json({ message: "أعاد النموذج نصّاً فارغاً — أعد المحاولة" });
    }

    return res.status(200).json({
      text: out.trim(),
      model: use,
      // البتر يعني تسجيلاً أطول من سعة المخرَج — نقوله بدل قبول ناقصٍ صامتاً
      truncated: cand?.finishReason === "MAX_TOKENS",
      finishReason: cand?.finishReason || "",
    });
  } catch (error) {
    console.error("Transcribe_Audio:", error.message);
    return res
      .status(502)
      .json({ message: "تعذّر الاتصال بـGemini", error: error.message });
  }
};

export { DEFAULT_PROMPT };
