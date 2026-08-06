import dotenv from "dotenv";

dotenv.config();

// ─── التدقيق الإملائي عبر Gemini ──────────────────────────────────────────────
// المفتاح يبقى في الخادم (بخلاف مفتاح Mistral الذي يتجدّد كل ساعة): مفتاح
// Gemini ثابت وحصّته يومية، وتسريبه يستهلكها غيرُك.
//
// الخادم يستدعي النموذج ويعيد التصحيحات **خاماً**. الترشيح يجري في الواجهة
// حتى ترى ما رُفض ولماذا، وتستطيع نقض الرفض إن كنت أدرى — الشفافية هنا
// أهمّ من الاختصار لأن المستخدم يراجع كل كلمة قبل التطبيق.

const GEMINI = "https://generativelanguage.googleapis.com/v1beta";

// الموجّه منقول حرفياً عن spellcheck.py — كل جملة فيه ثمنُ خطأٍ وقع سابقاً
const PROMPT = `أنت مدقق إملائي لنصّ محاضرة طبية عربية ناتج عن مسح ضوئي.

مهمتك: **الأخطاء التي تُغيّر المعنى أو تُنتج كلمةً غير موجودة في العربية.**
غيرُ ذلك لا تلمسه.

صحّح هذه وحدها:
- كلمة غير موجودة في العربية نتجت عن قراءة خاطئة للحروف:
  «تمدن»←«تمعدن» · «الانصياف»←«الالتصاق» · «ليفية»←«كيفية»
- نقطةٌ مقروءة خطأً غيّرت الكلمة إلى أخرى لا يقبلها السياق:
  «شيوخ»←«شيوع» في سياق انتشار المرض
- كلمتان التصقتا، أو كلمة انقسمت خطأً في منتصفها

**لا تصحّح هذه إطلاقاً** — وهي أكثر ما يُهدر:
- الهمزة على الألف أو تحتها أو حذفها: «الاسنان» و«الأسنان» كلتاهما مقبولة
- التاء المربوطة والهاء في آخر الكلمة: «اللثه» و«اللثة» سيّان
- الألف المقصورة والياء: «على» و«علي» و«مستشفى» و«مستشفي»
- التشكيل كلّه، والمسافات، وعلامات الترقيم
- أي مصطلح لاتيني أو اسم علمي مهما بدا غريباً
- أي رقم أو نسبة أو تاريخ أو وحدة قياس
- أسلوب الجملة أو ترتيبها أو ركاكتها

قاعدة الحسم: **إن كانت الكلمة موجودة في العربية ويقبلها السياق، اتركها**
حتى لو ظننتَ غيرها أنسب. الترك أأمن من التغيير، والتصحيح التافه يُغرق
المراجعة فتضيع فيه الأخطاء الحقيقية.

لا تعلّق على صحّة المحتوى العلمي ولا تشكّك فيه.

أعد JSON فقط بهذا الشكل، بلا أي نصّ آخر:
{"corrections":[{"line":<رقم السطر كما هو معطى>,"before":"<الكلمة الخطأ>","after":"<الكلمة الصحيحة>"}]}
إن لم تجد أخطاء تستحقّ، أعد: {"corrections":[]}

النص (كل سطر مسبوق برقمه):
`;

/** أمثلة من تصحيحاتٍ قبِلها المستخدم سابقاً.
 *  تُقدَّم **استئناساً لا قاعدة**: النموذج قد يراها في سياق مختلف، وإلزامه
 *  بها يحوّل خطأً واحداً قديماً إلى خطأٍ متكرّر إلى الأبد. */
const learnedBlock = (learned) => {
  const list = Array.isArray(learned) ? learned.slice(0, 60) : [];
  if (!list.length) return "";
  const lines = list.map((x) => x.before + " ← " + x.after).join("\n");
  return `
تصحيحاتٌ قبِلها المحرِّر في هذه المادة سابقاً. استأنس بها في نمط
الأخطاء ولا تعتبرها قاعدة: إن لم يقبل السياق التصحيح هنا، تجاهله.
${lines}

`;
};

const guard = (req, res) => {
  const { PASSWORD } = req.body || {};
  if (!PASSWORD || PASSWORD !== process.env.PASSWORD) {
    res.status(401).json({ message: "غير مصرّح" });
    return false;
  }
  return true;
};

const defaultModel = () =>
  process.env.GEMINI_MODEL_SPELL ||
  process.env.GEMINI_MODEL ||
  "gemini-3.5-flash-lite";

/** النماذج المتاحة لهذا المفتاح — القائمة تُبنى من الحساب لا من قائمة
 *  مكتوبة يدوياً تتقادم. */
export const Gemini_Models = async (req, res) => {
  try {
    if (!guard(req, res)) return;
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return res
        .status(200)
        .json({ ready: false, models: [], current: defaultModel() });
    }
    const r = await fetch(`${GEMINI}/models?key=${key}&pageSize=100`);
    if (!r.ok) {
      return res.status(200).json({
        ready: true,
        models: [],
        current: defaultModel(),
        note: `تعذّر جلب القائمة (${r.status})`,
      });
    }
    const data = await r.json();
    const models = (data.models || [])
      .filter((m) =>
        (m.supportedGenerationMethods || []).includes("generateContent"),
      )
      .map((m) => String(m.name).replace(/^models\//, ""))
      .filter((n) => /gemini/i.test(n))
      .sort();
    return res
      .status(200)
      .json({ ready: true, models, current: defaultModel() });
  } catch (error) {
    return res.status(200).json({
      ready: false,
      models: [],
      current: defaultModel(),
      note: error.message,
    });
  }
};

/** يستخرج JSON من رد النموذج — أحياناً يلفّه بسياج ماركداون رغم التعليمات */
const extractJson = (text) => {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
};

/** يدقّق قطعةً واحدة (أسطر مرقّمة). التقطيع في الواجهة لأنها تعرف
 *  التقدّم وتديره؛ الخادم يخدم طلباً واحداً في كل مرة. */
export const Spellcheck_Chunk = async (req, res) => {
  try {
    if (!guard(req, res)) return;
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return res
        .status(503)
        .json({ message: "GEMINI_API_KEY غير مضبوط في الخادم" });
    }
    const { text, model, learned } = req.body;
    if (!text || !String(text).trim()) {
      return res.status(200).json({ corrections: [] });
    }

    const use = String(model || defaultModel()).replace(/^models\//, "");
    const r = await fetch(
      `${GEMINI}/models/${use}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: PROMPT + learnedBlock(learned) + text }] }],
          generationConfig: {
            // حرارة صفر: التدقيق ليس موضع إبداع
            temperature: 0,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    const raw = await r.text();
    if (!r.ok) {
      // 429 يعني تجاوز الحصة — نمرّر المهلة المقترحة لتنتظرها الواجهة
      let retryAfter = null;
      const m = raw.match(/"retryDelay"\s*:\s*"(\d+)s"/);
      if (m) retryAfter = Number(m[1]) + 2;
      return res.status(r.status).json({
        message:
          r.status === 429
            ? "تجاوزتَ حصة الطلبات — انتظر ثم أعد"
            : `فشل التدقيق (${r.status})`,
        retryAfter,
        detail: raw.slice(0, 300),
      });
    }

    const data = JSON.parse(raw);
    const out = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = extractJson(out);
    if (!parsed) {
      return res
        .status(200)
        .json({ corrections: [], note: "رد غير مفهوم — عُدّت القطعة سليمة" });
    }
    const corrections = (parsed.corrections || [])
      .filter((c) => c && c.before && c.after)
      .map((c) => ({
        line: Number(c.line),
        before: String(c.before),
        after: String(c.after),
      }))
      .filter((c) => Number.isFinite(c.line));

    return res.status(200).json({ corrections, model: use });
  } catch (error) {
    console.error("Spellcheck_Chunk:", error.message);
    return res
      .status(502)
      .json({ message: "تعذّر الاتصال بـGemini", error: error.message });
  }
};
