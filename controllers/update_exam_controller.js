import Exams from "../models/exam.js";
import Admins from "../models/admin.js"; // تأكد من الاسم الصحيح
import Employers from "../models/employer.js";
import dotenv from "dotenv";

dotenv.config();

/**
 * حماية تصنيفات الذكاء الاصطناعي المخزّنة:
 * التطبيقات الحالية بتستبدل مصفوفة الأسئلة كاملة وما بتعرف حقول
 * classification — فلو استبدلنا مباشرة رح تنمحي التصنيفات مع كل حفظة.
 * هون منرجّع التصنيف القديم لأي سؤال وارد بلا تصنيف (مطابقة بنص السؤال).
 * لما تتحدث التطبيقات لاحقاً وتبعت التصنيف بنفسها، قيمتها هي اللي بتعتمد.
 */
const merge_classifications = (old_questions, incoming_questions) => {
  if (!Array.isArray(incoming_questions)) return incoming_questions;

  const old_map = new Map();
  for (const q of old_questions || []) {
    if (q && q.classification) old_map.set(q.question, q);
  }

  return incoming_questions.map((q) => {
    if (!q || q.classification || !old_map.has(q.question)) return q;
    const old = old_map.get(q.question);
    return {
      ...q,
      classification: old.classification,
      classification_confidence: old.classification_confidence || 0,
    };
  });
};

/**
 * إلحاق أمثلة تدريب المصنّف بسجل المادة (classification_log):
 * الأسئلة المحذوفة أثناء التعديل (rejected) والنسخ الأصلية قبل التعديل
 * (needs_edit). إلحاق فقط — ما منستبدل السجل، فالتطبيقات اللي ما بتبعت
 * الحقل ما بتأثر عليه. التكرار الحرفي (نفس النص ونفس التصنيف) بينتجاهل.
 */
const LOG_LABELS = ["needs_edit", "rejected"];
const append_classification_log = (The_Exam, incoming_log) => {
  if (!Array.isArray(incoming_log) || incoming_log.length === 0) return 0;

  const existing = new Set(
    (The_Exam.classification_log || []).map(
      (e) => `${e.classification}::${e.question}`,
    ),
  );

  let added = 0;
  for (const item of incoming_log) {
    if (!item || typeof item.question !== "string" || !item.question.trim())
      continue;
    if (!LOG_LABELS.includes(item.classification)) continue;
    const key = `${item.classification}::${item.question}`;
    if (existing.has(key)) continue;
    existing.add(key);
    The_Exam.classification_log.push({
      question: item.question,
      options: Array.isArray(item.options) ? item.options.map(String) : [],
      answer: String(item.answer ?? ""),
      lecture: typeof item.lecture === "string" ? item.lecture : "",
      classification: item.classification,
      logged_at: new Date(),
    });
    added += 1;
  }
  return added;
};

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const Update_Exam = async (req, res) => {
  console.log("=== Update_Exam called ===");
  console.log("body keys:", Object.keys(req.body));
  try {
    const {
      _id,
      new_name,
      new_info,
      new_questions,
      new_time,
      new_visible,
      new_available_to,
      new_open_mode,
      new_price,
      new_summary,
      // سجل أمثلة تدريب المصنّف (اختياري) — أسئلة محذوفة/نسخ أصلية قبل التعديل
      new_classification_log,
      // ─── حقول مسار العضو ───
      employee, // true إذا كان الحفظ صادراً من تطبيق العضو
      employer_id, // _id العضو
      elapsed_seconds, // الوقت المنقضي من بدء التعديل إلى الحفظ
    } = req.body;

    if (!_id) {
      return res.status(400).json({ message: "رمز المادة ناقص" });
    }
    const The_Exam = await Exams.findOne({
      _id: _id,
    });
    if (!The_Exam) {
      return res.status(404).json({ message: "المادة غير موجود" });
    }

    // ─── مسار العضو: تعديل الأسئلة فقط مع تسجيل الجلسة ──────────────────────────
    if (employee === true) {
      // تحقّق من أن هذه المادة مخصّصة لهذا العضو
      if (
        !employer_id ||
        !The_Exam.employer ||
        String(The_Exam.employer) !== String(employer_id)
      ) {
        return res.status(403).json({ message: "تعذر التعديل" });
      }

      // أبقِ كل معلومات المادة كما هي، وغيّر الأسئلة فقط
      // (مع الحفاظ على تصنيفات الذكاء الاصطناعي المخزّنة)
      The_Exam.questions = merge_classifications(
        The_Exam.questions,
        new_questions,
      );
      append_classification_log(The_Exam, new_classification_log);
      await The_Exam.save();

      // أضف معلومات الجلسة لسجل العضو
      const employer = await Employers.findById(employer_id);
      if (employer) {
        employer.sessions.push({
          subject_id: String(The_Exam._id),
          subject_name: The_Exam.name,
          edited_at: new Date(),
          elapsed_seconds: Number(elapsed_seconds) || 0,
        });
        await employer.save();
      }

      return res.status(200).json({ message: "تم حفظ تعديلات الأسئلة" });
    }

    const clean_new_available_to = Array.isArray(new_available_to)
      ? new_available_to.filter(
          (x) => x !== null && x !== undefined && x !== "",
        )
      : [];

    const clean_old_available_to = The_Exam.available_to.filter(
      (x) => x !== null && x !== undefined && x !== "",
    );

    // حساب عدد الطلاب قبل وبعد
    const old_count = clean_old_available_to.length;
    const new_count = clean_new_available_to.length;

    // حساب الفرق
    const difference = new_count - old_count;

    let profit_to_add = 0;
    if (difference > 0) {
      profit_to_add = difference * new_price;
    }

    // الحصول على الأدمن
    const admin = await Admins.findById(The_Exam.admin_id);
    if (!admin) {
      return res.status(404).json({ message: "الأدمن غير موجود" });
    }

    // إضافة الربح
    admin.total_profit += profit_to_add;
    await admin.save();

    // تحديث بيانات المادة
    The_Exam.name = new_name;
    The_Exam.info = new_info;
    The_Exam.questions = merge_classifications(
      The_Exam.questions,
      new_questions,
    );
    The_Exam.time = new_time;
    The_Exam.visible = new_visible;
    The_Exam.available_to = clean_new_available_to;
    The_Exam.open_mode = new_open_mode;
    The_Exam.price = new_price;
    // قبل The_Exam.save()
    console.log("new_summary received:", JSON.stringify(new_summary, null, 2));
    console.log("summary length:", new_summary?.length);
    if (Array.isArray(new_summary) && new_summary.length > 0) {
      The_Exam.summary = new_summary;
    }
    append_classification_log(The_Exam, new_classification_log);

    await The_Exam.save();

    res.status(200).json({
      message: "تم تحديث بيانات المادة",
      profit_added: profit_to_add,
      old_count,
      new_count,
    });
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ message: "تحقق من اتصالك بالانترنت", error: error.message });
  }
};
