import dotenv from "dotenv";

dotenv.config();

// ─── توليد البطاقات والاختبار التحريري ────────────────────────────────────────
// نفس النمط لكليهما: نصّ المحاضرة ← Gemini ← عناصر مُهيكلة تُراجَع ثم تُرفع.
// المفتاح في الخادم (ثابت وحصّته يومية، بخلاف مفتاح Mistral المتجدّد).

const GEMINI = "https://generativelanguage.googleapis.com/v1beta";

const guard = (req, res) => {
  const { PASSWORD } = req.body || {};
  if (!PASSWORD || PASSWORD !== process.env.PASSWORD) {
    res.status(401).json({ message: "غير مصرّح" });
    return false;
  }
  return true;
};

const defaultModel = () => process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

// البطاقة تختبر الاسترجاع لا الفهم: الجواب تفصيلٌ دقيق يُستدعى من الذاكرة،
// لا شرحٌ يُعاد بناؤه. لذلك الشروط صريحة وممنوعاتها أصرح.
const FLASH_PROMPT = (
  count,
) => `أنت صانع بطاقات استرجاع (flash cards) لطالب طب يستعد لامتحان.

اصنع بالضبط ${count} بطاقة من نصّ المحاضرة التالي.

شروط الوجه (السؤال):
- واضح ودقيق ومحدَّد، يسأل عن تفصيلٍ بعينه لا عن موضوع عام.
- صعب: يتطلّب استرجاعاً حقيقياً من الذاكرة لا استنتاجاً من السؤال نفسه.
- لا يحتوي الجواب داخله ولا يلمّح إليه.
- قائم على معلومة موجودة فعلاً في النصّ.

شروط الظهر (الجواب):
- قصير جداً: كلمة أو رقم أو عبارة قصيرة. لا شرح ولا جملة تفسيرية.
- تفصيل دقيق يُسترجَع، لا إعادة صياغة للسؤال.

ممنوع:
- أسئلة عامة من نوع «ما هو؟» أو «تكلّم عن».
- أسئلة يمكن الإجابة عنها بنعم أو لا.
- اختلاق أي معلومة ليست في النصّ.

أعد JSON فقط بهذا الشكل بلا أي نصّ آخر:
{"cards":[{"front":"<السؤال>","back":"<الجواب القصير>"}]}
`;

const WRITTEN_PROMPT = (count) => `أنت واضع اختبار تحريري لطالب طب.

اصنع بالضبط ${count} سؤالاً مقالياً من نصّ المحاضرة التالي.

شروط السؤال:
- واضح ومحدَّد، يطلب استرجاعاً وتنظيماً لمعلومات المحاضرة.
- صعب بقدر معقول: لا يُجاب بكلمة واحدة، ولا يحتاج معرفةً خارج النصّ.
- لا يتكرّر موضوعه مع سؤال آخر.

شروط الجواب النموذجي:
- دقيق ومختصر، يذكر النقاط المطلوبة بوضوح ليصحَّح عليه آلياً.
- كل ما فيه مذكور في النصّ. لا تختلق شيئاً.

أعد JSON فقط بهذا الشكل بلا أي نصّ آخر:
{"questions":[{"question":"<السؤال>","model_answer":"<الجواب النموذجي>"}]}
`;

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

/** يحدّ طول النصّ المُرسَل: محاضرة ضخمة تتجاوز نافذة النموذج فيُرفض الطلب
 *  كلّه. القصّ من الوسط يُبقي المقدّمة والخاتمة وهما أغنى بالمفاهيم. */
const fitText = (text, max = 120000) => {
  const s = String(text || "");
  if (s.length <= max) return s;
  const half = Math.floor(max / 2);
  return `${s.slice(0, half)}\n\n[…قُصّ جزء من المنتصف لطول المحاضرة…]\n\n${s.slice(-half)}`;
};

export const Generate_Items = async (req, res) => {
  try {
    if (!guard(req, res)) return;
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return res
        .status(503)
        .json({ message: "GEMINI_API_KEY غير مضبوط في الخادم" });
    }

    const { kind, text, model, focus, count } = req.body;
    if (!text || !String(text).trim()) {
      return res.status(400).json({ message: "نصّ المحاضرة ناقص" });
    }
    if (kind !== "flash" && kind !== "written") {
      return res.status(400).json({ message: "نوع غير معروف" });
    }

    const n = Math.max(
      1,
      Math.min(50, Number(count) || (kind === "flash" ? 10 : 5)),
    );
    const base = kind === "flash" ? FLASH_PROMPT(n) : WRITTEN_PROMPT(n);
    // موضوع التركيز يُلحَق بالموجّه لا يستبدله: الشروط تبقى سارية
    const focusLine = String(focus || "").trim()
      ? `\nركّز خصوصاً على هذا الجانب: ${String(focus).trim()}\n`
      : "";

    const use = String(model || defaultModel()).replace(/^models\//, "");
    const r = await fetch(
      `${GEMINI}/models/${use}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `${base}${focusLine}\nنصّ المحاضرة:\n${fitText(text)}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.4,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    const raw = await r.text();
    if (!r.ok) {
      let retryAfter = null;
      const m = raw.match(/"retryDelay"\s*:\s*"(\d+)s"/);
      if (m) retryAfter = Number(m[1]) + 2;
      return res.status(r.status).json({
        message:
          r.status === 429
            ? "تجاوزتَ حصة الطلبات — انتظر ثم أعد"
            : `فشل التوليد (${r.status})`,
        retryAfter,
        detail: raw.slice(0, 300),
      });
    }

    const data = JSON.parse(raw);
    const out = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = extractJson(out);
    if (!parsed) {
      return res
        .status(502)
        .json({ message: "رد غير مفهوم من النموذج — أعد المحاولة" });
    }

    if (kind === "flash") {
      const cards = (parsed.cards || [])
        .filter(
          (c) =>
            c && String(c.front || "").trim() && String(c.back || "").trim(),
        )
        .map((c) => ({
          front: String(c.front).trim(),
          back: String(c.back).trim(),
        }));
      return res.status(200).json({ kind, model: use, cards });
    }

    const questions = (parsed.questions || [])
      .filter(
        (q) =>
          q &&
          String(q.question || "").trim() &&
          String(q.model_answer || "").trim(),
      )
      .map((q) => ({
        question: String(q.question).trim(),
        model_answer: String(q.model_answer).trim(),
      }));
    return res.status(200).json({ kind, model: use, questions });
  } catch (error) {
    console.error("Generate_Items:", error.message);
    return res
      .status(502)
      .json({ message: "تعذّر الاتصال بـGemini", error: error.message });
  }
};
