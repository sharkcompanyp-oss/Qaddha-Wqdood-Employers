import mongoose from "mongoose";

// ─── السجلات ──────────────────────────────────────────────────────────────────
// ثلاث مجموعات يكتبها تطبيق الطلاب: أسئلة الذكاء الاصطناعي، ونتائج
// الاختبارات التحريرية، ورموز الإشعارات.
//
// ── لماذا لا نماذج Mongoose هنا؟ ──
// كاتبها خادمٌ آخر (تطبيق الطلاب) وهو مالك هيكلها. تعريف schema ثانٍ هنا
// يعني نسخةً تتخلّف عن الأصل ويُسقط Mongoose كل حقلٍ لا يعرفه **صامتاً** —
// فنقرأ عبر السائق مباشرةً: ما في المجموعة هو ما يظهر، لا ما يعرفه نموذجنا.
//
// ولا يُجلب شيء بمجرّد فتح التبويب: كل سجلّ بطلبٍ صريح، فبعضها بعشرات
// الآلاف من الوثائق.

const COLLECTIONS = {
  ai_questions: {
    name: "aiquestions",
    label: "أسئلة الذكاء الاصطناعي",
    sort: { created_at: -1 },
    projection: {
      student_ID: 1,
      subject_id: 1,
      lecture_id: 1,
      question: 1,
      selection: 1,
      answer: 1,
      created_at: 1,
    },
  },
  written_results: {
    name: "writtenresults",
    label: "نتائج الاختبارات التحريرية",
    sort: { created_at: -1 },
    projection: {
      student_ID: 1,
      subject_id: 1,
      lecture_id: 1,
      total_pct: 1,
      duration_used_sec: 1,
      created_at: 1,
      results: 1,
    },
  },
  push_tokens: {
    name: "studentpushtokens",
    label: "رموز الإشعارات",
    sort: { createdAt: -1 },
    projection: { _id_student: 1, token: 1, createdAt: 1 },
  },
};

const guard = (req, res) => {
  const { PASSWORD } = req.body || {};
  if (!PASSWORD || PASSWORD !== process.env.PASSWORD) {
    res.status(401).json({ message: "غير مصرّح" });
    return false;
  }
  return true;
};

const col = (key) => {
  const meta = COLLECTIONS[key];
  if (!meta) return null;
  return { meta, handle: mongoose.connection.db.collection(meta.name) };
};

/** أسماء السجلات وأعدادها — خفيف، لعرض التبويب قبل أي جلب */
export const Logs_Summary = async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const out = {};
    for (const [key, meta] of Object.entries(COLLECTIONS)) {
      // تقديريّ لا دقيق: العدّ الدقيق على مجموعةٍ ضخمة يمسح كل وثيقة
      out[key] = {
        label: meta.label,
        count: await mongoose.connection.db
          .collection(meta.name)
          .estimatedDocumentCount(),
      };
    }
    return res.status(200).json({ logs: out });
  } catch (e) {
    return res
      .status(500)
      .json({ message: "تعذّر قراءة السجلات", error: e.message });
  }
};

/** جلب سجلّ بعينه — بطلبٍ صريح وبحدٍّ أقصى */
export const Logs_Fetch = async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const { kind, limit, skip, search } = req.body || {};
    const c = col(kind);
    if (!c) return res.status(400).json({ message: "سجلّ غير معروف" });

    const lim = Math.max(1, Math.min(500, Number(limit) || 100));
    const off = Math.max(0, Number(skip) || 0);

    const q = {};
    const term = String(search || "").trim();
    if (term) {
      // بحثٌ بمعرّف الطالب: أكثر ما يُبحَث به، وهو مفهرس في المصدر
      q.$or = [{ student_ID: term }, { _id_student: term }];
    }

    const rows = await c.handle
      .find(q, { projection: c.meta.projection })
      .sort(c.meta.sort)
      .skip(off)
      .limit(lim)
      .toArray();

    return res.status(200).json({
      kind,
      label: c.meta.label,
      rows,
      count: rows.length,
      total: await c.handle.estimatedDocumentCount(),
    });
  } catch (e) {
    return res
      .status(500)
      .json({ message: "تعذّر الجلب", error: e.message });
  }
};

/** حذف وثيقة بعينها — أو المجموعة كلّها بتأكيدٍ صريح */
export const Logs_Delete = async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const { kind, id, all } = req.body || {};
    const c = col(kind);
    if (!c) return res.status(400).json({ message: "سجلّ غير معروف" });

    if (all === true) {
      const r = await c.handle.deleteMany({});
      return res
        .status(200)
        .json({ message: `حُذف ${r.deletedCount} سجلاً`, deleted: r.deletedCount });
    }

    if (!id) return res.status(400).json({ message: "رمز السجل ناقص" });
    let _id = id;
    try {
      _id = new mongoose.Types.ObjectId(String(id));
    } catch {
      // بعض المجموعات مفتاحها نصّي (رموز الإشعارات) — نتركه كما هو
    }
    const r = await c.handle.deleteOne({ _id });
    if (!r.deletedCount)
      return res.status(404).json({ message: "لم يُعثر على السجل" });
    return res.status(200).json({ message: "حُذف السجل", deleted: 1 });
  } catch (e) {
    return res
      .status(500)
      .json({ message: "تعذّر الحذف", error: e.message });
  }
};
