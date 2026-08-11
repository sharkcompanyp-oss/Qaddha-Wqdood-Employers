import AgentFixLog from "../models/agent_fix_log.js";
import dotenv from "dotenv";

dotenv.config();

// ─── سجلّ تصحيحات الوكيل ─────────────────────────────────────────────────────
// الشكاوى المعالَجة تُحذف من الصندوق، فهذا هو المكان الوحيد الذي يخبرك
// ماذا غيّر الوكيل في محتواك. تُراجَع هنا بلا أن تُثقل قائمة العمل.

const KIND_AR = {
  question: "سؤال",
  summary: "ملخّص",
  flash: "بطاقة",
  written: "تحريري",
  curriculum: "نصّ المقرَّر",
};

export const Get_Fix_Log = async (req, res) => {
  try {
    const { PASSWORD, limit, subject_id } = req.body || {};
    if (!PASSWORD || PASSWORD !== process.env.PASSWORD) {
      return res.status(401).json({ message: "غير مصرّح" });
    }

    const match = {};
    if (subject_id) match.subject_id = String(subject_id);

    const rows = await AgentFixLog.find(match)
      .sort({ created_at: -1 })
      .limit(Math.min(Number(limit) || 100, 500))
      .lean();

    return res.status(200).json({
      count: rows.length,
      fixes: rows.map((r) => ({
        _id: String(r._id),
        at: r.created_at,
        kind: r.kind,
        kind_label: KIND_AR[r.kind] || r.kind,
        field: r.field,
        before: r.before,
        after: r.after,
        subject_name: r.subject_name,
        lecture_name: r.lecture_name,
        path: r.path,
        evidence: r.evidence,
        student_reply: r.student_reply,
        confidence: r.confidence,
        points_awarded: r.points_awarded,
        student_ID: r.student_ID,
      })),
    });
  } catch (err) {
    console.error("Get_Fix_Log:", err);
    return res.status(500).json({ message: "تعذّر جلب سجلّ التصحيحات" });
  }
};
