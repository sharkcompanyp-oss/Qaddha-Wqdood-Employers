import dotenv from "dotenv";

dotenv.config();

// ─── تفريغ الصوت إلى نصّ مقرَّر ────────────────────────────────────────────────
// مبني على audio-transcriber (app.py) لكن بمعمارٍ مختلف اضطراراً:
//
// هناك: المتصفّح ← خادم محلّي على جهازك ← Google. الملف يمرّ بخطوة واحدة
//       على شبكةٍ محلّية، والذاكرة ذاكرة جهازك.
// هنا:  المتصفّح ← Render ← Google. تسجيل ساعة (60م.ب) يصير 79م.ب بعد
//       base64، و~198م.ب في ذاكرة Render التي سعتها 512م.ب → انهيار (502)،
//       والرفع نفسه عبر شبكةٍ بطيئة → Network Error.
//
// جرّبنا الرفع المباشر من المتصفّح إلى Google، وفشل: **Google لا يرسل أي
// ترويسة CORS على رابط الرفع** (تحقّقنا: access-control-allow-origin غائبة
// تماماً)، فالمتصفّح يمنعه حتماً مهما كانت الشبكة.
//
// فالملف يمرّ بخادمنا اضطراراً — لكن **مجرىً لا حِملاً**:
//   • بلا base64: البايتات خامٌ كما هي (توفير 33% من الحجم).
//   • بلا تجميع في الذاكرة: نُمرّر مجرى الطلب إلى Google مباشرةً، فتبقى
//     الذاكرة ثابتة مهما كبر الملف بدل ~198م.ب لتسجيل ساعة.
// وهذا ما يجعل تسجيل الساعة يمرّ على خادمٍ سعته 512م.ب.

const GEMINI = "https://generativelanguage.googleapis.com/v1beta";

// رفع الملفات له مضيفٌ بمسارٍ مختلف: /upload/v1beta/files.
// أما /v1beta/files فمسار السرد والقراءة، ولا يفهم بروتوكول الرفع
// القابل للاستئناف — يردّ بلا ترويسة x-goog-upload-url، فيبدو العطل
// «تعذّر بدء الرفع» بلا سبب ظاهر.
const GEMINI_UPLOAD = "https://generativelanguage.googleapis.com/upload/v1beta";

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

const SKIP = ["-tts", "-image", "image-", "embedding", "gemma", "lyria", "veo", "imagen"];

const guard = (req, res) => {
  const { PASSWORD } = req.body || {};
  if (!PASSWORD || PASSWORD !== process.env.PASSWORD) {
    res.status(401).json({ message: "غير مصرّح" });
    return false;
  }
  return true;
};

const keyOr503 = (res) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    res.status(503).json({ message: "GEMINI_API_KEY غير مضبوط في الخادم" });
    return null;
  }
  return key;
};

/** النماذج التي تقبل الصوت */
export const Transcribe_Models = async (req, res) => {
  try {
    if (!guard(req, res)) return;
    const key = process.env.GEMINI_API_KEY;
    if (!key) return res.status(200).json({ ready: false, models: [] });

    const r = await fetch(`${GEMINI}/models?key=${key}&pageSize=100`);
    if (!r.ok) return res.status(200).json({ ready: true, models: [] });
    const data = await r.json();
    const models = (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
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
    return res.status(200).json({ ready: false, models: [], note: error.message });
  }
};

/** يرفع الملف إلى Google بتمرير مجرى الطلب مباشرةً.
 *  البايتات تصل خاماً في جسم الطلب (Content-Type = نوع الصوت)، والمعطيات
 *  في الترويسات — فلا JSON ولا base64 ولا تجميع في الذاكرة. */
export const Transcribe_Upload = async (req, res) => {
  try {
    // الحارس من الترويسة لا من الجسم: الجسم هنا بايتات صوت لا JSON
    if (
      !req.headers["x-panel-password"] ||
      req.headers["x-panel-password"] !== process.env.PASSWORD
    ) {
      return res.status(401).json({ message: "غير مصرّح" });
    }
    const key = keyOr503(res);
    if (!key) return;

    const mimeType = req.headers["x-audio-mime"] || "audio/mpeg";
    const sizeBytes = Number(req.headers["content-length"] || 0);
    const displayName = decodeURIComponent(
      String(req.headers["x-audio-name"] || "audio"),
    );
    if (!sizeBytes) {
      return res.status(400).json({ message: "حجم الملف ناقص" });
    }

    const r = await fetch(`${GEMINI_UPLOAD}/files?key=${key}`, {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(sizeBytes),
        "X-Goog-Upload-Header-Content-Type": mimeType || "audio/mpeg",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: displayName || "audio" } }),
    });

    const uploadUrl = r.headers.get("x-goog-upload-url");
    if (!uploadUrl) {
      // نمرّر ردّ Google كما هو: «تعذّر بدء الرفع» وحدها لا تُصلح شيئاً،
      // ونصّ الردّ يقول أهو مفتاح خاطئ أم حصة نفدت أم مسار غلط.
      const t = await r.text();
      return res.status(502).json({
        message: `تعذّر بدء الرفع (${r.status})`,
        detail: t.slice(0, 400),
      });
    }

    // المجرى يُمرَّر كما هو: لا req.body ولا Buffer.concat — الذاكرة ثابتة
    const up = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Length": String(sizeBytes),
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize",
      },
      body: req,
      duplex: "half", // إلزامي في Node عند إرسال مجرى
    });

    const text = await up.text();
    if (!up.ok) {
      return res.status(502).json({
        message: `فشل رفع الملف (${up.status})`,
        detail: text.slice(0, 400),
      });
    }
    const info = JSON.parse(text);
    const file = info?.file || info;
    return res.status(200).json({
      fileName: file?.name,
      uri: file?.uri,
      state: file?.state,
      mimeType,
    });
  } catch (error) {
    console.error("Transcribe_Upload:", error.message);
    return res
      .status(502)
      .json({ message: "تعذّر رفع الملف", error: error.message });
  }
};

/** ٢) حالة الملف بعد الرفع — Google يعالجه قبل أن يصلح للاستعمال */
export const Transcribe_Status = async (req, res) => {
  try {
    if (!guard(req, res)) return;
    const key = keyOr503(res);
    if (!key) return;

    const { fileName } = req.body;
    if (!fileName) return res.status(400).json({ message: "اسم الملف ناقص" });

    const r = await fetch(`${GEMINI}/${fileName}?key=${key}`);
    const j = await r.json();
    return res.status(200).json({
      state: j?.state || "UNKNOWN",
      uri: j?.uri || null,
      error: j?.error?.message || null,
    });
  } catch (error) {
    return res.status(502).json({ message: "تعذّر فحص الحالة", error: error.message });
  }
};

/** ٣) التفريغ من ملفٍ مرفوع سلفاً. الجسم صغير (رابط لا بايتات)،
 *  لكن الرد يستغرق دقائق لتسجيلٍ طويل. */
export const Transcribe_Run = async (req, res) => {
  try {
    if (!guard(req, res)) return;
    const key = keyOr503(res);
    if (!key) return;

    const { fileUri, mimeType, model, prompt } = req.body;
    if (!fileUri) return res.status(400).json({ message: "رابط الملف ناقص" });
    if (!model) return res.status(400).json({ message: "لم يُحدَّد النموذج" });

    const use = String(model).replace(/^models\//, "");
    const text = String(prompt || "").trim() || DEFAULT_PROMPT;

    // مهلة صريحة: الاتصال المعلَّق بلا حدّ يستهلك عاملاً على الخادم إلى الأبد
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 14 * 60 * 1000);

    let r;
    try {
      r = await fetch(`${GEMINI}/models/${use}:generateContent?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text },
                { file_data: { mime_type: mimeType || "audio/mpeg", file_uri: fileUri } },
              ],
            },
          ],
          generationConfig: { temperature: 0.1, maxOutputTokens: 65536 },
        }),
      });
    } catch (e) {
      clearTimeout(timer);
      if (e.name === "AbortError") {
        return res.status(504).json({
          message:
            "تجاوز التفريغ أربع عشرة دقيقة. قسّم التسجيل إلى أجزاء أقصر وأعد.",
        });
      }
      throw e;
    }
    clearTimeout(timer);

    const raw = await r.text();
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
      return res.status(502).json({ message: "أعاد النموذج نصّاً فارغاً — أعد المحاولة" });
    }

    return res.status(200).json({
      text: out.trim(),
      model: use,
      truncated: cand?.finishReason === "MAX_TOKENS",
      finishReason: cand?.finishReason || "",
    });
  } catch (error) {
    console.error("Transcribe_Run:", error.message);
    return res.status(502).json({ message: "تعذّر الاتصال بـGemini", error: error.message });
  }
};

/** ٤) حذف الملف من خوادم Google — لا نترك تسجيلات المقرَّر عندهم */
export const Transcribe_Cleanup = async (req, res) => {
  try {
    if (!guard(req, res)) return;
    const key = keyOr503(res);
    if (!key) return;
    const { fileName } = req.body;
    if (fileName) {
      await fetch(`${GEMINI}/${fileName}?key=${key}`, { method: "DELETE" }).catch(
        () => {},
      );
    }
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(200).json({ ok: false });
  }
};

export { DEFAULT_PROMPT };
