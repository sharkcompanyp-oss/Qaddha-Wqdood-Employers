import StudyPlan from "../models/study_plan.js";
import StudyTask from "../models/study_task.js";
import dotenv from "dotenv";

dotenv.config();

// ─── خطط طالب — للاطّلاع من لوحة التحكم ─────────────────────────────────────
// الحاجة العملية: طالبٌ يطلب استرداد مبلغه. القرار يحتاج جوابين في شاشة
// واحدة: هل أنجز خطته؟ وبكم اشترك ومتى وبأي رقم عملية؟
//
// الخطط المؤرشفة تُعرض مع النشطة: انتهاء الاشتراك لا يمحو السجلّ، وهو
// بالضبط ما يُطالَع عند النزاع.

const AR_TYPE = {
  text: "نص المقرَّر",
  curriculum: "نص المقرَّر",
  summary: "الملخّص",
  exam: "الأسئلة",
  questions: "الأسئلة",
  cards: "البطاقات",
  written: "التحريري",
};

export const Get_Student_Plans = async (req, res) => {
  try {
    const { PASSWORD, student_ID } = req.body || {};
    if (!PASSWORD || PASSWORD !== process.env.PASSWORD) {
      return res.status(401).json({ message: "غير مصرّح" });
    }
    if (!student_ID) {
      return res.status(400).json({ message: "الرقم الجامعي مطلوب" });
    }

    const plans = await StudyPlan.find({ student_ID: String(student_ID) })
      .sort({ _id: -1 })
      .lean();

    if (plans.length === 0) return res.status(200).json({ plans: [] });

    // إنجاز الخطط النشطة يُحسب الآن (المؤرشفة تحمل لقطتها المجمَّدة)
    const liveIds = plans
      .filter((p) => p.status !== "archived" && !p.completion?.computed_at)
      .map((p) => String(p._id));

    const counts = new Map();
    if (liveIds.length > 0) {
      const rows = await StudyTask.aggregate([
        { $match: { plan_id: { $in: liveIds } } },
        {
          $group: {
            _id: { plan: "$plan_id", status: "$status", type: "$type" },
            n: { $sum: 1 },
          },
        },
      ]);
      rows.forEach((r) => {
        const key = String(r._id.plan);
        const cur = counts.get(key) || { total: 0, done: 0, pending: {} };
        cur.total += r.n;
        if (r._id.status === "done") cur.done += r.n;
        else {
          const t = AR_TYPE[r._id.type] || r._id.type || "غير معروف";
          cur.pending[t] = (cur.pending[t] || 0) + r.n;
        }
        counts.set(key, cur);
      });
    }

    const shaped = plans.map((p) => {
      const live = counts.get(String(p._id));
      // المؤرشفة: لقطتها المجمَّدة هي الحقيقة. النشطة: نحسبها الآن.
      const c = p.completion?.computed_at
        ? {
            label: p.completion.label,
            pct: p.completion.pct,
            tasks_total: p.completion.tasks_total,
            tasks_done: p.completion.tasks_done,
            pending_by_type: Object.fromEntries(
              Object.entries(p.completion.pending_by_type || {}).map(([k, v]) => [
                AR_TYPE[k] || k,
                v,
              ]),
            ),
            frozen: true,
          }
        : live
          ? {
              label:
                live.total > 0 && (live.done / live.total) * 100 >= 90
                  ? "منجز"
                  : "غير منجز",
              pct: live.total > 0 ? Math.round((live.done / live.total) * 100) : 0,
              tasks_total: live.total,
              tasks_done: live.done,
              pending_by_type: live.pending,
              frozen: false,
            }
          : null;

      return {
        _id: String(p._id),
        subject_id: p.subject_id,
        subject_name: p.subject_name || "",
        status: p.status,
        archived_at: p.archived_at || null,
        archived_reason: p.archived_reason || "",
        final_date: p.final?.date || null,
        created_at: p._id.getTimestamp ? p._id.getTimestamp() : null,
        completion: c,
        purchase: p.purchase || null,
      };
    });

    return res.status(200).json({ plans: shaped });
  } catch (err) {
    console.error("Get_Student_Plans:", err);
    return res.status(500).json({ message: "تعذّر جلب خطط الطالب" });
  }
};
