import mongoose from "mongoose";
import Exams from "../models/exam.js";
import Student from "../models/student.js";
import StudyPlan from "../models/study_plan.js";
import StudyTask from "../models/study_task.js";
import { isPanel } from "../services/access.js";

// ─── مشتركو «معدل» ────────────────────────────────────────────────────────────
// كل مادةٍ لها مشتركو معدل، وكل مشتركٍ بخطته الدراسية في تلك المادة وحالها.
// الخطة يملكها باك اند الطلاب (EXAMS/backend) ونقرؤها هنا قراءةً فقط:
//   StudyPlan.subject_id = _id المادة نصّاً · StudyPlan.student_ID = الرقم الجامعي نصّاً
//   available_to_moadal = أرقام جامعية نصّاً · Student.ID = عدد
//
// /moadal/overview  نظرةٌ واحدة: المواد ← المشتركون ← ملخّص خطة كلٍّ منهم
// /moadal/plan      تفاصيل خطة واحدة: مهامها محاضرةً محاضرة — تُطلب عند فتحها
//                   فقط، فالمهام بالمئات لكل خطة.

const DONE_PCT = 90; // «منجز» — الحدّ نفسه الذي يُبنى عليه قرار الضمان

const planShape = (p, live) => {
  // المؤرشفة/المنتهية تحمل لقطةً مجمّدة هي الحقيقة؛ النشطة تُحسب الآن
  const frozen = p.completion?.computed_at;
  const total = frozen ? p.completion.tasks_total : live?.total || 0;
  const done = frozen ? p.completion.tasks_done : live?.done || 0;
  const pct = frozen ? p.completion.pct : total ? Math.round((done / total) * 100) : 0;
  return {
    _id: String(p._id),
    status: p.status,
    created_at: p.created_at || (p._id.getTimestamp ? p._id.getTimestamp() : null),
    activated_at: p.activated_at || null,
    archived_at: p.archived_at || null,
    archived_reason: p.archived_reason || "",
    ended_at: p.ended_at || null,
    ended_reason: p.ended_reason || "",
    quiz: p.quiz?.skipped ? { skipped: true } : p.quiz?.date ? { date: p.quiz.date } : null,
    final: p.final?.date ? { date: p.final.date, precision: p.final.precision || "exact" } : null,
    periods: p.periods || [],
    included_tiers: p.included_tiers || [],
    excluded_count: (p.excluded_lecture_ids || []).length,
    purchase: p.purchase?.date || p.purchase?.amount ? p.purchase : null,
    progress: {
      total,
      done,
      pct,
      label: total ? (pct >= DONE_PCT ? "منجز" : "غير منجز") : "",
      frozen: !!frozen,
      skipped: live?.skipped || 0,
      overdue: frozen ? 0 : live?.overdue || 0,
      next_due: frozen ? null : live?.next_due || null,
      last_done: live?.last_done || null,
      est_seconds: live?.est || 0,
      active_seconds: live?.active || 0,
      by_type: live?.by_type || {},
    },
  };
};

export const Moadal_Overview = async (req, res) => {
  try {
    if (!isPanel(req)) return res.status(401).json({ message: "غير مصرّح" });

    const subjects = await Exams.aggregate([
      { $match: { "available_to_moadal.0": { $exists: true } } },
      {
        $project: {
          name: 1,
          ID: 1,
          college_id: 1,
          price_moadal: 1,
          moadal_available: 1,
          available_to_moadal: 1,
          lectures_count: { $size: { $ifNull: ["$lectures", []] } },
        },
      },
      { $sort: { name: 1 } },
    ]);

    const studentIds = [
      ...new Set(subjects.flatMap((s) => (s.available_to_moadal || []).map(String))),
    ];
    const subjectIds = subjects.map((s) => String(s._id));

    const [students, plans] = await Promise.all([
      Student.find(
        { ID: { $in: studentIds.map(Number).filter(Number.isFinite) } },
        { name: 1, ID: 1, college_id: 1, nick_name: 1, points: 1 },
      ).lean(),
      StudyPlan.find({ subject_id: { $in: subjectIds }, student_ID: { $in: studentIds } })
        .sort({ _id: -1 })
        .lean(),
    ]);

    // مهام الخطط الحيّة وحدها — للمجمّدة لقطتها
    const livePlanIds = plans.filter((p) => !p.completion?.computed_at).map((p) => String(p._id));
    const now = new Date();
    const live = new Map();
    if (livePlanIds.length) {
      const rows = await StudyTask.aggregate([
        { $match: { plan_id: { $in: livePlanIds }, status: { $ne: "archived" } } },
        {
          $group: {
            _id: { plan: "$plan_id", type: "$type" },
            total: { $sum: 1 },
            done: { $sum: { $cond: [{ $eq: ["$status", "done"] }, 1, 0] } },
            skipped: { $sum: { $cond: [{ $eq: ["$status", "skipped"] }, 1, 0] } },
            overdue: {
              $sum: {
                $cond: [
                  { $and: [{ $eq: ["$status", "pending"] }, { $lt: ["$due_at", now] }, { $ne: ["$due_at", null] }] },
                  1,
                  0,
                ],
              },
            },
            next_due: {
              $min: { $cond: [{ $eq: ["$status", "pending"] }, "$due_at", null] },
            },
            last_done: { $max: "$completed_at" },
            est: { $sum: "$est_seconds" },
            active: { $sum: "$actual_active_seconds" },
          },
        },
      ]);
      rows.forEach((r) => {
        const k = String(r._id.plan);
        const c = live.get(k) || {
          total: 0, done: 0, skipped: 0, overdue: 0, next_due: null, last_done: null, est: 0, active: 0, by_type: {},
        };
        c.total += r.total;
        c.done += r.done;
        c.skipped += r.skipped;
        c.overdue += r.overdue;
        c.est += r.est || 0;
        c.active += r.active || 0;
        if (r.next_due && (!c.next_due || r.next_due < c.next_due)) c.next_due = r.next_due;
        if (r.last_done && (!c.last_done || r.last_done > c.last_done)) c.last_done = r.last_done;
        c.by_type[r._id.type] = { total: r.total, done: r.done };
        live.set(k, c);
      });
    }

    const studentOf = new Map(students.map((s) => [String(s.ID), s]));
    // الأحدث لكل (طالب، مادة) — الترتيب تنازلي بـ_id
    const planOf = new Map();
    const olderCount = new Map();
    plans.forEach((p) => {
      const k = `${p.student_ID}|${p.subject_id}`;
      if (!planOf.has(k)) planOf.set(k, p);
      else olderCount.set(k, (olderCount.get(k) || 0) + 1);
    });

    const out = subjects.map((s) => ({
      _id: String(s._id),
      name: s.name,
      ID: s.ID,
      college_id: s.college_id,
      price_moadal: s.price_moadal || 0,
      moadal_available: !!s.moadal_available,
      lectures_count: s.lectures_count,
      students: (s.available_to_moadal || []).map((sidRaw) => {
        const sid = String(sidRaw);
        const st = studentOf.get(sid);
        const k = `${sid}|${String(s._id)}`;
        const p = planOf.get(k);
        return {
          ID: sid,
          name: st?.name || "",
          nick_name: st?.nick_name || "",
          points: st?.points ?? null,
          missing: !st, // رقمٌ في قائمة المادة بلا حسابٍ مطابق
          plan: p ? planShape(p, live.get(String(p._id))) : null,
          older_plans: olderCount.get(k) || 0,
        };
      }),
    }));

    return res.status(200).json({ subjects: out, generated_at: now });
  } catch (err) {
    console.error("Moadal_Overview:", err);
    return res.status(500).json({ message: "تعذّر جلب مشتركي معدل" });
  }
};

/** body: { PASSWORD, plan_id } — الخطة كاملة ومهامها مرتّبة */
export const Moadal_Plan = async (req, res) => {
  try {
    if (!isPanel(req)) return res.status(401).json({ message: "غير مصرّح" });
    const { plan_id } = req.body || {};
    if (!plan_id || !mongoose.isValidObjectId(plan_id)) {
      return res.status(400).json({ message: "معرّف الخطة غير صالح" });
    }
    const plan = await StudyPlan.findById(plan_id).lean();
    if (!plan) return res.status(404).json({ message: "الخطة غير موجودة" });
    const tasks = await StudyTask.find(
      { plan_id: String(plan._id) },
      {
        lecture_id: 1, lecture_title: 1, type: 1, unit_range: 1, tier: 1, est_seconds: 1,
        actual_active_seconds: 1, status: 1, earliest_at: 1, due_at: 1, phase: 1, seq: 1,
        review: 1, late_since: 1, completed_at: 1,
      },
    )
      .sort({ seq: 1, due_at: 1, _id: 1 })
      .lean();
    return res.status(200).json({
      plan: { ...planShape(plan, null), subject_name: plan.subject_name || "" },
      tasks: tasks.map((t) => ({ ...t, _id: String(t._id) })),
      now: new Date(),
    });
  } catch (err) {
    console.error("Moadal_Plan:", err);
    return res.status(500).json({ message: "تعذّر جلب الخطة" });
  }
};
