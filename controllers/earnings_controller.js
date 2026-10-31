import Exams from "../models/exam.js";
import Refund from "../models/refund.js";
import AiCost from "../models/ai_cost.js";
import PriceSetting from "../models/price_setting.js";
import { employerOf, isPanel } from "../services/access.js";
import { REVENUE_STAGES } from "../services/revenue.js";

// ─── نسبة العضو ───────────────────────────────────────────────────────────────
// لكل مادة مُسلَّمة لعضو:
//   الإيراد     = ما تحسبه الإحصائيات (services/revenue.js) بالليرة
//   المرتجعات   = مجموع مبالغ مرتجعات المادة
//   التكاليف    = مجموع كلفة طلبات الذكاء الاصطناعي على المادة (دولار) × سعر الصرف
//   الصافي      = الإيراد − المرتجعات − التكاليف
//   نسبة العضو  = الصافي × النسبة (٤٠٪ افتراضياً)، ولا تقلّ عن صفر
//
// الأرقام تُحسب لحظة الطلب من المسجَّل الآن — لا شيء يُخزَّن، فأي مرتجع أو
// طلبٍ جديد يظهر فوراً.

export const DEFAULT_FINANCE = { usd_rate: 0, share_pct: 40 };

const getFinance = async () => {
  const doc = await PriceSetting.findOne({ key: "default" }).select("finance").lean();
  return { ...DEFAULT_FINANCE, ...(doc?.finance || {}) };
};

/** حساب أرباح مواد عضوٍ واحد */
const earningsOf = async (employerId) => {
  const [subjects, finance] = await Promise.all([
    Exams.aggregate([{ $match: { employer: String(employerId) } }, ...REVENUE_STAGES]),
    getFinance(),
  ]);
  const ids = subjects.map((s) => s.sid);
  const [refunds, costs] = await Promise.all([
    Refund.aggregate([
      { $match: { exam_id: { $in: ids } } },
      { $group: { _id: "$exam_id", amount: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    AiCost.aggregate([
      { $match: { exam_id: { $in: ids } } },
      {
        $group: {
          _id: "$exam_id",
          usd: { $sum: { $ifNull: ["$cost_usd", 0] } },
          // طلباتٌ بلا سعر مضبوط — كلفتها لم تدخل المجموع
          unpriced: { $sum: { $cond: [{ $eq: ["$cost_usd", null] }, 1, 0] } },
        },
      },
    ]),
  ]);
  const rBy = Object.fromEntries(refunds.map((r) => [String(r._id), r]));
  const cBy = Object.fromEntries(costs.map((c) => [String(c._id), c]));
  const rate = Number(finance.usd_rate) || 0;
  const pct = Number(finance.share_pct) || 0;

  const rows = subjects.map((s) => {
    const revenue = s.total_profit || 0;
    const refundsAmount = rBy[s.sid]?.amount || 0;
    const costsUsd = cBy[s.sid]?.usd || 0;
    // بلا سعر صرف لا يُعرف ما تساويه التكاليف بالليرة — فلا تُحسب النسبة
    const costsSyp = costsUsd > 0 && !rate ? null : Math.round(costsUsd * rate);
    const net = costsSyp === null ? null : revenue - refundsAmount - costsSyp;
    return {
      exam_id: s.sid,
      name: s.subject_name,
      tarfee_students: s.tarfee_students,
      moadal_students: s.moadal_students,
      price: s.price,
      price_moadal: s.price_moadal,
      revenue,
      refunds: refundsAmount,
      refunds_count: rBy[s.sid]?.count || 0,
      costs_usd: costsUsd,
      costs_syp: costsSyp,
      unpriced: cBy[s.sid]?.unpriced || 0,
      net,
      share: net === null ? null : Math.max(0, Math.round((net * pct) / 100)),
    };
  });
  rows.sort((a, b) => (b.share || 0) - (a.share || 0));
  const total = (k) => rows.reduce((t, r) => t + (r[k] || 0), 0);
  return {
    finance: { usd_rate: rate, share_pct: pct },
    rows,
    totals: {
      revenue: total("revenue"),
      refunds: total("refunds"),
      costs_usd: total("costs_usd"),
      costs_syp: rows.some((r) => r.costs_syp === null) ? null : total("costs_syp"),
      net: rows.some((r) => r.net === null) ? null : total("net"),
      share: rows.some((r) => r.share === null) ? null : total("share"),
    },
  };
};

/**
 * body: اللوحة { PASSWORD, target_employer_id } · العضو { employer_id } (أرباحه هو)
 * الردّ: { finance, rows, totals }
 */
export const Earnings_Employer = async (req, res) => {
  try {
    let target = null;
    if (isPanel(req)) {
      target = req.body?.target_employer_id;
    } else {
      const emp = await employerOf(req);
      if (!emp) return res.status(401).json({ message: "غير مصرّح" });
      // العضو لا يرى إلا أرباحه — المعرّف من هويته لا من الطلب
      target = emp._id;
    }
    if (!target) return res.status(400).json({ message: "العضو ناقص" });
    return res.status(200).json(await earningsOf(target));
  } catch (error) {
    console.error("Earnings_Employer:", error.message);
    return res.status(500).json({ message: "تعذّر حساب الأرباح" });
  }
};

/** body: { PASSWORD } · الردّ: { finance } */
export const Finance_Get = async (req, res) => {
  try {
    if (!isPanel(req)) return res.status(401).json({ message: "غير مصرّح" });
    return res.status(200).json({ finance: await getFinance() });
  } catch (error) {
    return res.status(500).json({ message: "تعذّر الجلب" });
  }
};

/** body: { PASSWORD, finance: { usd_rate, share_pct } } */
export const Finance_Save = async (req, res) => {
  try {
    if (!isPanel(req)) return res.status(401).json({ message: "غير مصرّح" });
    const f = req.body?.finance || {};
    const usd_rate = Number(f.usd_rate);
    const share_pct = Number(f.share_pct);
    if (!Number.isFinite(usd_rate) || usd_rate < 0) {
      return res.status(400).json({ message: "سعر صرف غير صالح" });
    }
    if (!Number.isFinite(share_pct) || share_pct < 0 || share_pct > 100) {
      return res.status(400).json({ message: "النسبة بين ٠ و١٠٠" });
    }
    await PriceSetting.updateOne(
      { key: "default" },
      { $set: { finance: { usd_rate, share_pct }, updated_at: new Date() } },
      { upsert: true },
    );
    return res.status(200).json({ finance: { usd_rate, share_pct } });
  } catch (error) {
    return res.status(500).json({ message: "تعذّر الحفظ" });
  }
};
