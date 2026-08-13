import PromptSetting from "../models/prompt_setting.js";
import {
  bustPromptCache,
  NUMBER_DEFAULTS,
  NUMBER_META,
  PROMPT_DEFAULTS,
  readAll,
} from "../services/prompts.js";

// ─── إدارة الموجّهات من اللوحة ────────────────────────────────────────────────
// عرضٌ وتحريرٌ وإعادةٌ إلى الافتراضي. لا موجّه يُعدَّل بتعديل الكود ودفع
// الخادم بعد اليوم.

const guard = (req, res) => {
  const { PASSWORD } = req.body || {};
  if (!PASSWORD || PASSWORD !== process.env.PASSWORD) {
    res.status(401).json({ message: "غير مصرّح" });
    return false;
  }
  return true;
};

/** كل الموجّهات والأعداد: القيمة الحالية والافتراضية ووصف كلٍّ منها */
export const Get_Prompts = async (req, res) => {
  if (!guard(req, res)) return;
  try {
    return res.status(200).json(await readAll());
  } catch (e) {
    return res
      .status(500)
      .json({ message: "تعذّر جلب الموجّهات", error: e.message });
  }
};

/**
 * حفظ تعديلات جزئية: `{prompts: {name: text}, numbers: {name: n}}`.
 *
 * الجزئيّة مقصودة — اللوحة تحفظ الموجّه الذي عدّلته وحده، فلا يدهس حفظُ
 * موجّهٍ في تبويبٍ ما تعديلاً غير محفوظ في تبويبٍ آخر.
 *
 * النصّ الفارغ يعني «أعِد الافتراضي»: نحذف المفتاح بدل تخزين فراغٍ يُرسَل
 * إلى النموذج فيصير الوكيل بلا تعليمات.
 */
export const Update_Prompts = async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const { prompts = {}, numbers = {} } = req.body || {};
    const set = {};
    const unset = {};
    const unknown = [];

    for (const [name, text] of Object.entries(prompts)) {
      if (!(name in PROMPT_DEFAULTS)) {
        unknown.push(name);
        continue;
      }
      const v = String(text ?? "");
      if (!v.trim()) unset[`prompts.${name}`] = "";
      else set[`prompts.${name}`] = v;
    }

    for (const [name, raw] of Object.entries(numbers)) {
      if (!(name in NUMBER_DEFAULTS)) {
        unknown.push(name);
        continue;
      }
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        unset[`numbers.${name}`] = "";
        continue;
      }
      const meta = NUMBER_META[name] || {};
      const lo = Number.isFinite(meta.min) ? meta.min : -Infinity;
      const hi = Number.isFinite(meta.max) ? meta.max : Infinity;
      set[`numbers.${name}`] = Math.min(hi, Math.max(lo, Math.round(n)));
    }

    if (unknown.length) {
      return res.status(400).json({
        message: `اسمٌ غير معروف: ${unknown.join("، ")}`,
      });
    }

    const update = { $set: { ...set, updated_at: new Date() } };
    if (Object.keys(unset).length) update.$unset = unset;

    await PromptSetting.findOneAndUpdate({ key: "default" }, update, {
      new: true,
      upsert: true,
    });
    bustPromptCache();

    return res.status(200).json({
      message: "حُفظت الموجّهات",
      ...(await readAll()),
    });
  } catch (e) {
    return res
      .status(500)
      .json({ message: "تعذّر حفظ الموجّهات", error: e.message });
  }
};

/** إعادة موجّهٍ بعينه — أو كلّها — إلى نسخة المصنع */
export const Reset_Prompts = async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const { name } = req.body || {};
    if (name) {
      const inPrompts = name in PROMPT_DEFAULTS;
      const inNumbers = name in NUMBER_DEFAULTS;
      if (!inPrompts && !inNumbers) {
        return res.status(400).json({ message: `اسمٌ غير معروف: ${name}` });
      }
      const field = inPrompts ? `prompts.${name}` : `numbers.${name}`;
      await PromptSetting.findOneAndUpdate(
        { key: "default" },
        { $unset: { [field]: "" }, $set: { updated_at: new Date() } },
        { upsert: true },
      );
    } else {
      await PromptSetting.findOneAndUpdate(
        { key: "default" },
        { $set: { prompts: {}, numbers: {}, updated_at: new Date() } },
        { upsert: true },
      );
    }
    bustPromptCache();
    return res.status(200).json({
      message: name ? "أُعيد الموجّه إلى الافتراضي" : "أُعيدت كل الموجّهات",
      ...(await readAll()),
    });
  } catch (e) {
    return res
      .status(500)
      .json({ message: "تعذّرت الإعادة", error: e.message });
  }
};
