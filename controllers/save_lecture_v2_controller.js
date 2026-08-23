import Exams from "../models/exam.js";
import dotenv from "dotenv";
import { allowSubject } from "../services/access.js";
import {
  recomputeMoadalAvailability,
  readCompletenessFromDb,
  isEligibleFromReport,
} from "../services/moadal_eligibility.js";

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

    // ── لا نُنزل المادة ──
    // كان هنا findById يجلب الوثيقة كاملةً: نصّ كل محاضرة وملخّصها وأسئلتها،
    // مئات الكيلوبايتات (وميغابايتات في مادةٍ كبيرة) على السلك في كل ضغطة حفظ،
    // ثمّ لا يُكتب منها إلا الجزء الذي لُمس.
    //
    // الآن: القراءة الوحيدة هي حقلا المقرَّر السابقان — ولا تحدث إلا إن نقص
    // أحدهما من الحمولة (فهما وحدهما ما يرجع إليه المنطق أدناه). والكتابة
    // تجري في القاعدة بـ$set موضعيّ بلا نقل وثيقة.
    const c0 = payload.curriculum;
    const needsPrev =
      c0 && typeof c0 === "object" &&
      (c0.text === undefined || c0.source_file === undefined);

    const found = await Exams.findOne(
      { _id, "lectures.lecture_id": String(lecture_id) },
      needsPrev
        ? { name: 1, moadal_available: 1, "lectures.$": 1 }
        : { name: 1, moadal_available: 1 },
    ).lean();

    if (!found) {
      // نفرّق بين «لا مادة» و«لا محاضرة» كما كان: الرسالتان تُرشدان لمكانين
      const exists = await Exams.exists({ _id });
      return res
        .status(404)
        .json({ message: exists ? "المحاضرة غير موجودة" : "المادة غير موجودة" });
    }

    // نسخةٌ للقراءة فقط — لا تُحفَظ، ولا تحمل إلا ما لزم للرجوع إليه
    const lec = (found.lectures && found.lectures[0]) || {};
    const exam = { _id, name: found.name, moadal_available: found.moadal_available };

    // ما يُكتب فعلاً: مسارات موضعية داخل المحاضرة المطابِقة وحدها
    const $set = {};
    const changed = [];

    if (typeof payload.name === "string" && payload.name.trim()) {
      $set["lectures.$.name"] = payload.name.trim();
      changed.push("name");
    }
    if (payload.order !== undefined) {
      $set["lectures.$.order"] = Number(payload.order) || 0;
      changed.push("order");
    }

    if (payload.curriculum !== undefined) {
      const c = payload.curriculum;
      if (c === null) {
        $set["lectures.$.curriculum"] = {
          text: "",
          source_file: "",
          word_count: 0,
          updated_at: null,
        };
        changed.push("curriculum:cleared");
      } else {
        const text = String(c.text ?? lec.curriculum?.text ?? "");
        const cur = {
          text,
          source_file: String(c.source_file ?? lec.curriculum?.source_file ?? ""),
          word_count: words(text),
          updated_at: new Date(),
        };
        $set["lectures.$.curriculum"] = cur;
        changed.push(`curriculum:${cur.word_count}كلمة`);
      }
    }

    if (payload.summary !== undefined) {
      if (payload.summary === null) {
        $set["lectures.$.summary"] = { sections: [], word_count: 0 };
        changed.push("summary:cleared");
      } else {
        const sections = Array.isArray(payload.summary.sections)
          ? payload.summary.sections
          : Array.isArray(payload.summary)
            ? payload.summary
            : [];
        $set["lectures.$.summary"] = {
          sections,
          word_count: summaryWords(sections),
        };
        changed.push(`summary:${sections.length}قسم`);
      }
    }

    if (Array.isArray(payload.questions)) {
      const qs = payload.questions
        .filter((q) => q && String(q.question || "").trim())
        .map((q, i) => ({
          // نحفظ q_id الوارد إن وُجد: تقدّم الطالب مُسجَّل عليه،
          // وتوليد معرّف جديد لسؤالٍ قائم يمحو إنجازه.
          q_id: String(q.q_id || `${lecture_id}_q${i + 1}`),
          question: String(q.question || ""),
          options: fourOptions(q.options),
          answer: String(q.answer ?? ""),
        }));
      $set["lectures.$.questions"] = qs;
      changed.push(`questions:${qs.length}`);
    }

    if (Array.isArray(payload.flash_cards)) {
      const fc = payload.flash_cards
        .filter(
          (c) => c && (String(c.front || "").trim() || String(c.back || "").trim()),
        )
        .map((c, i) => ({
          card_id: String(c.card_id || `${lecture_id}_c${i + 1}`),
          front: String(c.front || ""),
          back: String(c.back || ""),
        }));
      $set["lectures.$.flash_cards"] = fc;
      changed.push(`flash:${fc.length}`);
    }

    if (payload.written_exam !== undefined) {
      const w = payload.written_exam || {};
      const we = {
        duration_min: Number(w.duration_min) > 0 ? Number(w.duration_min) : 30,
        questions: (Array.isArray(w.questions) ? w.questions : [])
          .filter((q) => q && String(q.question || "").trim())
          .map((q, i) => ({
            q_id: String(q.q_id || `${lecture_id}_w${i + 1}`),
            question: String(q.question || ""),
            model_answer: String(q.model_answer || ""),
          })),
      };
      $set["lectures.$.written_exam"] = we;
      changed.push(`written:${we.questions.length}`);
    }

    if (changed.length === 0) {
      return res.status(200).json({ message: "لا تغييرات", changed: [] });
    }

    // ① الكتابة: $set موضعيّ على المحاضرة المطابِقة وحدها.
    //    `lectures.$` يحتاج المحاضرة في المرشِّح — وهي فيه.
    const w = await Exams.updateOne(
      { _id, "lectures.lecture_id": String(lecture_id) },
      { $set },
    );
    if (!w.matchedCount) {
      // اختفت المحاضرة بين القراءة والكتابة (حذفٌ متزامن)
      return res.status(409).json({ message: "تغيّرت المادة أثناء الحفظ — أعد الفتح" });
    }

    // ② الأهلية: تُحسب في القاعدة بعد الكتابة، وتُقرأ أعلاماً لا محتوى.
    //    بعد الكتابة لا قبلها، وإلا حُسبت على حالةٍ تجاوزها الحفظ.
    //
    // وشبكة أمان: خطأُ هذا الحساب لا يُرى في اللوحة بل يظهر عند الطالب —
    // يدفع ثمن «معدل» ويجد محتوى ناقصاً، وهي العلّة التي وُجدت هذه الوحدة
    // لإصلاحها. فإن تعذّر الحساب في القاعدة أو خرج فارغاً بلا سبب، نرجع
    // إلى الطريق المُجرَّب (تحميل الوثيقة) بدل كتابة علَمٍ قد يكون خاطئاً.
    let now;
    try {
      const report = await readCompletenessFromDb(Exams, _id);
      if (!report.length) throw new Error("تقرير فارغ");
      now = isEligibleFromReport(report);
    } catch (e) {
      console.warn("[معدل] تعذّر الحساب في القاعدة، رجوعٌ إلى الوثيقة:", e.message);
      const full = await Exams.findById(_id);
      if (full) {
        const el = recomputeMoadalAvailability(full);
        now = el.now;
        if (el.changed) await full.save();
      }
    }

    const was = found.moadal_available === true;
    if (now !== undefined && was !== now) {
      await Exams.updateOne({ _id }, { $set: { moadal_available: now } });
      console.log(`[معدل] ${exam.name}: ${was} → ${now}`);
    }

    return res.status(200).json({
      message: "تم الحفظ",
      changed,
      lecture_id,
      moadal_available: now === undefined ? found.moadal_available : now,
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
