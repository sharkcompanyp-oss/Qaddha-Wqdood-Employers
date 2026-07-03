import Exams from "../models/exam.js";
import Admins from "../models/admin.js"; // تأكد من الاسم الصحيح
import Employers from "../models/employer.js";
import QuestionClassifications from "../models/question_classification.js";
import dotenv from "dotenv";

dotenv.config();

const VALID_LABELS = ["accepted", "needs_edit", "rejected"];

const clean_classification_entry = (item) => {
  if (!item || typeof item.question !== "string" || !item.question.trim())
    return null;
  if (!VALID_LABELS.includes(item.classification)) return null;
  return {
    question: item.question,
    options: Array.isArray(item.options) ? item.options.map(String) : [],
    answer: String(item.answer ?? ""),
    lecture: typeof item.lecture === "string" ? item.lecture : "",
    classification: item.classification,
    classification_confidence:
      typeof item.classification_confidence === "number"
        ? Math.max(0, Math.min(1, item.classification_confidence))
        : 0,
    logged_at: new Date(),
  };
};

/**
 * تخزين تصنيفات جلسة التعديل في الكولكشن المستقل (QuestionClassifications).
 * القادم من المحرر: لقطة حية كاملة (accepted) + أمثلة الجلسة الجديدة
 * (needs_edit للنسخ الأصلية قبل التعديل، rejected للمحذوف).
 * الدمج: اللقطة الحية تستبدل accepted القديمة بالكامل، بينما أمثلة
 * needs_edit/rejected القديمة تبقى (تاريخ تدريب) مع منع التكرار الحرفي
 * (نفس النص ونفس التصنيف). التطبيقات اللي ما بتبعت الحقل ما بتتأثر،
 * ومستند المادة نفسه ما ينكتب فيه أي حقل تصنيف.
 */
const upsert_question_classifications = async (The_Exam, incoming) => {
  if (!Array.isArray(incoming) || incoming.length === 0) return;

  const fresh = incoming
    .map(clean_classification_entry)
    .filter((e) => e !== null);
  if (fresh.length === 0) return;

  let doc = await QuestionClassifications.findOne({
    subject_id: String(The_Exam._id),
  });
  if (!doc) {
    doc = new QuestionClassifications({
      subject_id: String(The_Exam._id),
      questions: [],
    });
  }

  const fresh_keys = new Set(
    fresh.map((e) => `${e.classification}::${e.question}`),
  );
  const kept_history = (doc.questions || []).filter(
    (e) =>
      (e.classification === "needs_edit" || e.classification === "rejected") &&
      !fresh_keys.has(`${e.classification}::${e.question}`),
  );

  doc.subject_name = The_Exam.name || "";
  doc.questions = [...fresh, ...kept_history];
  doc.updated_at = new Date();
  await doc.save();
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
      // تصنيفات جلسة التعديل (اختياري) — تُخزَّن في كولكشن مستقل
      new_classifications,
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
      The_Exam.questions = new_questions;
      await The_Exam.save();
      await upsert_question_classifications(The_Exam, new_classifications);

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
    The_Exam.questions = new_questions;
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

    await The_Exam.save();
    await upsert_question_classifications(The_Exam, new_classifications);

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
