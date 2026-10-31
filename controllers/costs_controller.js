import AiCost from "../models/ai_cost.js";
import PriceSetting from "../models/price_setting.js";
import { allowTool, isPanel } from "../services/access.js";
import {
  DEFAULT_PRICES,
  bustPriceCache,
  costCtx,
  fillMissingCosts,
  getPrices,
  recordMistral,
} from "../services/costs.js";

// ─── التكاليف ─────────────────────────────────────────────────────────────────
// القراءة وتعديل الأسعار للوحة وحدها: أرقام المال لصاحبه لا للأعضاء.
// التسجيل يجري في الخادم مع كل طلب Gemini وClaude؛ Mistral وحده يُسجَّل
// من الواجهة لأن المسح يجري من المتصفّح مباشرةً، فيبلغ ردُّه الواجهةَ لا الخادم.

const panelOnly = (req, res) => {
  if (isPanel(req)) return true;
  res.status(401).json({ message: "غير مصرّح" });
  return false;
};

/**
 * سجلّ تكاليف مادة.
 * body: { PASSWORD, exam_id }
 * الردّ: { rows } — التجميع في الواجهة (حسب المحاضرة والخطوة والمزوّد)
 */
export const Costs_Subject = async (req, res) => {
  try {
    if (!panelOnly(req, res)) return;
    const { exam_id } = req.body || {};
    if (!exam_id) return res.status(400).json({ message: "المادة ناقصة" });
    const rows = await AiCost.find({ exam_id: String(exam_id) })
      .sort({ created_at: -1 })
      .select("-__v -ref")
      .lean();
    return res.status(200).json({ rows });
  } catch (error) {
    console.error("Costs_Subject:", error.message);
    return res.status(500).json({ message: "تعذّر جلب التكاليف" });
  }
};

/**
 * كلفة مسح Mistral — تُرسلها الواجهة بعد كل مسحٍ ناجح.
 * body: { PASSWORD|employer_id, pages, model, requested, ref, cost:{exam_id, lecture_id} }
 */
export const Costs_Log_Mistral = async (req, res) => {
  try {
    if (!(await allowTool(req, res))) return;
    const { pages, model, requested, ref } = req.body || {};
    const n = Math.round(Number(pages));
    if (!Number.isFinite(n) || n < 0 || n > 5000) {
      return res.status(400).json({ message: "عدد صفحات غير صالح" });
    }
    recordMistral(costCtx(req, "ocr"), {
      pages: n,
      model: model ? String(model) : "",
      requested: requested ? String(requested) : "",
      ref: ref ? `mistral:${String(ref)}` : undefined,
    });
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Costs_Log_Mistral:", error.message);
    return res.status(500).json({ message: "تعذّر التسجيل" });
  }
};

/** body: { PASSWORD } · الردّ: { prices, defaults } */
export const Prices_Get = async (req, res) => {
  try {
    if (!panelOnly(req, res)) return;
    return res.status(200).json({ prices: await getPrices(), defaults: DEFAULT_PRICES });
  } catch (error) {
    return res.status(500).json({ message: "تعذّر جلب الأسعار" });
  }
};

const cleanRow = (row) => {
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    const n = Number(v);
    if (v !== "" && v !== null && Number.isFinite(n) && n >= 0) out[k] = n;
  }
  return out;
};

/**
 * body: { PASSWORD, prices: { claude:{id:{…}}, claude_rules:{…}, gemini:{…}, mistral:{…} } }
 * الردّ: { prices, filled } — filled: طلباتٌ سُجّلت بلا سعر وحُسبت الآن
 */
export const Prices_Save = async (req, res) => {
  try {
    if (!panelOnly(req, res)) return;
    const input = req.body?.prices || {};
    const prices = {};
    for (const provider of ["claude", "gemini", "mistral"]) {
      prices[provider] = {};
      for (const [id, row] of Object.entries(input[provider] || {})) {
        const name = String(id).trim().replace(/^models\//, "");
        const clean = cleanRow(row);
        if (name && Object.keys(clean).length) prices[provider][name] = clean;
      }
    }
    prices.claude_rules = cleanRow(input.claude_rules);

    await PriceSetting.updateOne(
      { key: "default" },
      { $set: { prices, updated_at: new Date() } },
      { upsert: true },
    );
    bustPriceCache();
    const filled = await fillMissingCosts();
    return res.status(200).json({ prices: await getPrices(), filled });
  } catch (error) {
    console.error("Prices_Save:", error.message);
    return res.status(500).json({ message: "تعذّر حفظ الأسعار" });
  }
};
