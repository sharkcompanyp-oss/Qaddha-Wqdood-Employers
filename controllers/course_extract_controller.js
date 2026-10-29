import dotenv from "dotenv";
import { renderPrompt } from "../services/prompts.js";
import { allowTool } from "../services/access.js";

dotenv.config();

// ─── تفريغ دورة امتحانية ──────────────────────────────────────────────────────
// ملف دورة (PDF أو صورة، بخط اليد غالباً) ← Gemini يقرؤه ضوئياً ← أسئلة:
//   سؤال بخيارات  → MCQ (يحلّه النموذج إن لم يكن محلولاً، ويقول ذلك)
//   سؤال وجوابه فقط → بطاقة
// ويصنّف كل عنصر إلى محاضرةٍ من أسماء محاضرات المادة.
//
// الملف يُرفع بمسار التفريغ الصوتي نفسه (/production/transcribe-upload): مجرىً
// إلى Gemini Files بلا تجميعٍ في ذاكرة الخادم. هنا يصل رابطه فقط.
// الموجّه في «الإعدادات ← الموجّهات» (course_extract) قابل للتعديل.

const GEMINI = "https://generativelanguage.googleapis.com/v1beta";

const extractJson = (text) => {
  const fenced = String(text || "").match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : String(text || "");
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
};

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
// رمز الترقيم إن أبقاه النموذج: «أ-» «ب)» «A.» «1)»
const stripLabel = (s) =>
  clean(s).replace(/^(?:[أابجدهـ]|[A-Ea-e]|[1-5])\s*[-.)\]:،]\s*/u, "");

/**
 * عناصر بشكلٍ واحد يفهمه النظام:
 *   { type:"mcq", question, options[4], answer(1..4), solved_by_model, lecture }
 *   { type:"flash", question, answer_text, lecture }
 * المخطّط يحفظ أربعة خيارات: الأقل يُكمَّل بفراغ، والأكثر يُقصّ مع إبقاء
 * الصحيح بينها (يُنقل إلى الرابع إن كان بعده).
 */
const normalize = (items, lectureCount) =>
  (Array.isArray(items) ? items : [])
    .map((it) => {
      const question = clean(it?.question);
      if (!question) return null;
      let lecture = Math.round(Number(it?.lecture));
      if (!Number.isInteger(lecture) || lecture < 1 || lecture > lectureCount) lecture = 0;

      let options = (Array.isArray(it?.options) ? it.options : []).map(stripLabel).filter(Boolean);
      if (it?.type !== "flash" && options.length >= 2) {
        let answer = Math.round(Number(it?.answer));
        if (!Number.isInteger(answer) || answer < 1 || answer > options.length) answer = 1;
        if (answer > 4) {
          options[3] = options[answer - 1];
          answer = 4;
        }
        options = options.slice(0, 4);
        while (options.length < 4) options.push("");
        return {
          type: "mcq",
          question,
          options,
          answer,
          solved_by_model: Boolean(it?.solved_by_model),
          lecture,
        };
      }
      // بطاقة — أو «MCQ» بلا خيارات حقيقية، فجوابه نصّه
      const answer_text = clean(it?.answer_text) || clean(options[0]);
      if (!answer_text) return null;
      return { type: "flash", question, answer_text, lecture };
    })
    .filter(Boolean);

/**
 * body: { PASSWORD, fileUri, mimeType, model, lectures:[أسماء] }
 * الردّ: { items, model }
 */
export const Course_Extract = async (req, res) => {
  try {
    if (!(await allowTool(req, res))) return;
    const key = process.env.GEMINI_API_KEY;
    if (!key) return res.status(503).json({ message: "GEMINI_API_KEY غير مضبوط في الخادم" });

    const { fileUri, mimeType, model } = req.body || {};
    const lectures = (Array.isArray(req.body.lectures) ? req.body.lectures : []).map(clean);
    if (!fileUri) return res.status(400).json({ message: "رابط الملف ناقص" });
    if (!model) return res.status(400).json({ message: "لم يُحدَّد النموذج" });

    const list = lectures.length
      ? lectures.map((n, i) => `${i + 1}. ${n}`).join("\n")
      : "(لا محاضرات — اجعل lecture: 0 لكل سؤال)";
    const prompt = await renderPrompt("course_extract", { lectures: list });
    const use = String(model).replace(/^models\//, "");

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
                { text: prompt },
                { file_data: { mime_type: mimeType || "application/pdf", file_uri: fileUri } },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 65536,
            responseMimeType: "application/json",
          },
        }),
      });
    } catch (e) {
      clearTimeout(timer);
      if (e.name === "AbortError") {
        return res.status(504).json({ message: "تجاوز التفريغ أربع عشرة دقيقة — قسّم الملف وأعد" });
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
        message: r.status === 429 ? "تجاوزتَ حصة الطلبات — انتظر ثم أعد" : `فشل التفريغ (${r.status})`,
        retryAfter,
        detail: raw.slice(0, 300),
      });
    }

    const data = JSON.parse(raw);
    const cand = data?.candidates?.[0];
    const out = cand?.content?.parts?.map((p) => p.text || "").join("") || "";
    const parsed = extractJson(out);
    if (!parsed) {
      return res.status(502).json({
        message:
          cand?.finishReason === "MAX_TOKENS"
            ? "الدورة أطول من سعة المخرَج — قسّم الملف وأعد"
            : "ردّ غير مفهوم من النموذج — أعد المحاولة",
        raw: out.slice(0, 5000),
      });
    }

    const items = normalize(parsed.items, lectures.length);
    console.log(
      `📝 تفريغ دورة: ${items.length} عنصر (${items.filter((i) => i.type === "mcq").length} MCQ) · ${use}`,
    );
    return res.status(200).json({ items, model: use, truncated: cand?.finishReason === "MAX_TOKENS" });
  } catch (error) {
    console.error("Course_Extract:", error.message);
    return res.status(502).json({ message: "تعذّر تفريغ الدورة", error: error.message });
  }
};
