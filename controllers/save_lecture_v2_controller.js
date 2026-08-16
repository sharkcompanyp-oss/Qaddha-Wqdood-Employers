import Exams from "../models/exam.js";
import dotenv from "dotenv";
import { allowSubject } from "../services/access.js";
import { recomputeMoadalAvailability } from "../services/moadal_eligibility.js";

dotenv.config();

// ─── الحفظ في الهيكل الموحَّد ─────────────────────────────────────────────────
// كل شيء داخل كائن المحاضرة، والوصول بـlecture_id وحده. لا مطابقة أسماء،
// ولا حارس تزامن على فهارس مصفوفةٍ عامة — الشريحة معلومة الحدود بذاتها.
//
// الغياب في الحمولة يعني «لا تلمس» لا «احذف». حذف جزءٍ يُطلَب بـnull صريحة.

const guard = (req, res) => {
  const { PASSWORD } = req.body || {};
  if (!PASSWORD || PASSWORD !== process.env.PASSWORD) {
    res.status(401).json({ message: "غير مصرّح" });
    return false;
  }
  return true;
};

const words = (t) =>
  String(t || "").trim() ? String(t).trim().split(/\s+/).length : 0;

const summaryWords = (sections) => {
  let n = 0;
  const walk = (x) => {
    if (!x) return;
    if (typeof x === "string") return void (n += words(x));
    if (Array.isArray(x)) return void x.forEach(walk);
    if (typeof x === "object") {
      ["text", "title", "description", "strong", "label", "badge"].forEach((k) =>
        walk(x[k]),
      );
      ["items", "content_blocks"].forEach((k) => walk(x[k]));
    }
  };
  walk(sections);
  return n;
};

/** أربعة خيارات بالضبط — كل قارئ يفترضها، والزيادة لا تُرى والنقص يُعطّل زرّاً */
const fourOptions = (o) =>
  Array.from({ length: 4 }, (_, i) => String((Array.isArray(o) ? o[i] : "") ?? ""));

// أهلية «معدل» تُحسب في `services/moadal_eligibility.js` وحدها.
// كان هنا تعريفٌ ثانٍ لها بالمنطق نفسه — وتعريفان للقاعدة الواحدة يعني أن
// آخر مَن يحفظ يفوز، وهو ما جعل المادة المكتملة تعود `false` بعد حفظٍ جزئي.
const recomputeMoadal = (exam) => recomputeMoadalAvailability(exam);

export const Save_Lecture_V2 = async (req, res) => {
  try {
    if (!(await allowSubject(req, res, req.body?._id))) return;
    const { _id, lecture_id, payload = {} } = req.body;
    if (!_id) return res.status(400).json({ message: "رمز المادة ناقص" });
    if (!lecture_id) return res.status(400).json({ message: "رمز المحاضرة ناقص" });

    const exam = await Exams.findById(_id);
    if (!exam) return res.status(404).json({ message: "المادة غير موجودة" });

    const lec = (exam.lectures || []).find(
      (l) => String(l.lecture_id) === String(lecture_id),
    );
    if (!lec) return res.status(404).json({ message: "المحاضرة غير موجودة" });

    const changed = [];

    if (typeof payload.name === "string" && payload.name.trim()) {
      lec.name = payload.name.trim();
      changed.push("name");
    }
    if (payload.order !== undefined) {
      lec.order = Number(payload.order) || 0;
      changed.push("order");
    }

    if (payload.curriculum !== undefined) {
      const c = payload.curriculum;
      if (c === null) {
        lec.curriculum = { text: "", source_file: "", word_count: 0, updated_at: null };
        changed.push("curriculum:cleared");
      } else {
        const text = String(c.text ?? lec.curriculum?.text ?? "");
        lec.curriculum = {
          text,
          source_file: String(c.source_file ?? lec.curriculum?.source_file ?? ""),
          word_count: words(text),
          updated_at: new Date(),
        };
        changed.push(`curriculum:${lec.curriculum.word_count}كلمة`);
      }
    }

    if (payload.summary !== undefined) {
      if (payload.summary === null) {
        lec.summary = { sections: [], word_count: 0 };
        changed.push("summary:cleared");
      } else {
        const sections = Array.isArray(payload.summary.sections)
          ? payload.summary.sections
          : Array.isArray(payload.summary)
            ? payload.summary
            : [];
        lec.summary = { sections, word_count: summaryWords(sections) };
        changed.push(`summary:${sections.length}قسم`);
      }
    }

    if (Array.isArray(payload.questions)) {
      lec.questions = payload.questions
        .filter((q) => q && String(q.question || "").trim())
        .map((q, i) => ({
          // نحفظ q_id الوارد إن وُجد: تقدّم الطالب مُسجَّل عليه،
          // وتوليد معرّف جديد لسؤالٍ قائم يمحو إنجازه.
          q_id: String(q.q_id || `${lecture_id}_q${i + 1}`),
          question: String(q.question || ""),
          options: fourOptions(q.options),
          answer: String(q.answer ?? ""),
        }));
      changed.push(`questions:${lec.questions.length}`);
    }

    if (Array.isArray(payload.flash_cards)) {
      lec.flash_cards = payload.flash_cards
        .filter(
          (c) => c && (String(c.front || "").trim() || String(c.back || "").trim()),
        )
        .map((c, i) => ({
          card_id: String(c.card_id || `${lecture_id}_c${i + 1}`),
          front: String(c.front || ""),
          back: String(c.back || ""),
        }));
      changed.push(`flash:${lec.flash_cards.length}`);
    }

    if (payload.written_exam !== undefined) {
      const w = payload.written_exam || {};
      lec.written_exam = {
        duration_min: Number(w.duration_min) > 0 ? Number(w.duration_min) : 30,
        questions: (Array.isArray(w.questions) ? w.questions : [])
          .filter((q) => q && String(q.question || "").trim())
          .map((q, i) => ({
            q_id: String(q.q_id || `${lecture_id}_w${i + 1}`),
            question: String(q.question || ""),
            model_answer: String(q.model_answer || ""),
          })),
      };
      changed.push(`written:${lec.written_exam.questions.length}`);
    }

    if (changed.length === 0) {
      return res.status(200).json({ message: "لا تغييرات", changed: [] });
    }

    const el = recomputeMoadal(exam);
    if (el.changed) {
      console.log(`[معدل] ${exam.name}: ${el.was} → ${el.now}`);
    }
    await exam.save();

    return res.status(200).json({
      message: "تم الحفظ",
      changed,
      lecture_id,
      moadal_available: exam.moadal_available,
    });
  } catch (error) {
    console.error("Save_Lecture_V2:", error);
    return res.status(500).json({ message: "تعذّر الحفظ", error: error.message });
  }
};

/** إضافة محاضرة أو حذفها أو إعادة ترتيبها — بلا مساس بمحتوى الباقي */
export const Manage_Lectures_V2 = async (req, res) => {
  try {
    if (!(await allowSubject(req, res, req.body?._id))) return;
    const { _id, action, lecture_id, name, order } = req.body;
    if (!_id) return res.status(400).json({ message: "رمز المادة ناقص" });

    const exam = await Exams.findById(_id);
    if (!exam) return res.status(404).json({ message: "المادة غير موجودة" });
    exam.lectures = exam.lectures || [];

    if (action === "add") {
      const clean = String(name || "").trim();
      if (!clean) return res.status(400).json({ message: "اسم المحاضرة مطلوب" });
      // المعرّف مشتقّ من المادة والاسم — نفس منطق سكربت الهجرة، فلا
      // تتعارض المحاضرات المُضافة يدوياً مع المهاجَرة.
      const base = `${String(exam._id).slice(-6)}-${clean
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .slice(0, 40)}`;
      let id = base;
      let n = 2;
      while (exam.lectures.some((l) => String(l.lecture_id) === id)) {
        id = `${base}-${n}`;
        n += 1;
      }
      exam.lectures.push({
        lecture_id: id,
        name: clean,
        order: exam.lectures.length,
        curriculum: { text: "", source_file: "", word_count: 0, updated_at: null },
        summary: { sections: [], word_count: 0 },
        questions: [],
        flash_cards: [],
        written_exam: { duration_min: 30, questions: [] },
      });
      recomputeMoadal(exam);
      await exam.save();
      return res.status(200).json({ message: "أُضيفت", lecture_id: id });
    }

    if (action === "remove") {
      const before = exam.lectures.length;
      exam.lectures = exam.lectures.filter(
        (l) => String(l.lecture_id) !== String(lecture_id),
      );
      if (exam.lectures.length === before) {
        return res.status(404).json({ message: "المحاضرة غير موجودة" });
      }
      exam.lectures.forEach((l, i) => {
        l.order = i;
      });
      recomputeMoadal(exam);
      await exam.save();
      return res.status(200).json({ message: "حُذفت" });
    }

    if (action === "reorder") {
      const ids = Array.isArray(order) ? order.map(String) : [];
      exam.lectures.forEach((l) => {
        const i = ids.indexOf(String(l.lecture_id));
        if (i >= 0) l.order = i;
      });
      exam.lectures.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      await exam.save();
      return res.status(200).json({ message: "أُعيد الترتيب" });
    }

    return res.status(400).json({ message: "إجراء غير معروف" });
  } catch (error) {
    console.error("Manage_Lectures_V2:", error);
    return res.status(500).json({ message: "تعذّر التنفيذ", error: error.message });
  }
};
