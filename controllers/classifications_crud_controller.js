import QuestionClassifications from "../models/question_classification.js";
import Exams from "../models/exam.js";
import dotenv from "dotenv";

dotenv.config();

// تحقق بسيط من كلمة مرور لوحة التحكم الأساسية (نفس نمط باقي طلبات المدير)
const check_admin_password = (PASSWORD) =>
  PASSWORD && PASSWORD === process.env.PASSWORD;

const VALID_LABELS = ["accepted", "needs_edit", "rejected"];

// تنظيف عنصر تصنيف وارد من لوحة التحكم — يرفض ما لا نص له أو تصنيفه غير صالح
const clean_entry = (item) => {
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
    logged_at: item.logged_at ? new Date(item.logged_at) : new Date(),
  };
};

/**
 * جلب كل مستندات التصنيفات (قائمة خفيفة للوحة التحكم):
 * اسم المادة + عدّاد كل تصنيف + تاريخ آخر تحديث، بدون نصوص الأسئلة.
 *
 * POST /classifications  body: { PASSWORD }
 */
export const Get_Classifications = async (req, res) => {
  try {
    const { PASSWORD } = req.body;
    if (!check_admin_password(PASSWORD)) {
      return res.status(401).json({ message: "تعذر جلب البيانات" });
    }

    const docs = await QuestionClassifications.find(
      {},
      {
        subject_id: 1,
        subject_name: 1,
        updated_at: 1,
        "questions.classification": 1,
      },
    ).lean();

    const list = docs.map((d) => {
      const counts = { accepted: 0, needs_edit: 0, rejected: 0 };
      for (const q of d.questions || []) {
        if (counts[q.classification] !== undefined) counts[q.classification]++;
      }
      return {
        subject_id: d.subject_id,
        subject_name: d.subject_name,
        updated_at: d.updated_at,
        counts,
        total: (d.questions || []).length,
      };
    });

    res.json(list);
  } catch (error) {
    console.error("خطأ في Get_Classifications:", error.message);
    res.status(500).json({ message: "تأكد من اتصالك بالانترنت" });
  }
};

/**
 * جلب مستند تصنيفات مادة واحدة كاملاً.
 *
 * POST /getoneclassification  body: { PASSWORD, subject_id }
 */
export const Get_One_Classification = async (req, res) => {
  try {
    const { PASSWORD, subject_id } = req.body;
    if (!check_admin_password(PASSWORD)) {
      return res.status(401).json({ message: "تعذر جلب البيانات" });
    }
    if (!subject_id) {
      return res.status(400).json({ message: "رمز المادة ناقص" });
    }

    const doc = await QuestionClassifications.findOne({
      subject_id: String(subject_id),
    }).lean();
    if (!doc) {
      return res.status(404).json({ message: "لا يوجد مستند تصنيفات لهذه المادة" });
    }

    res.json(doc);
  } catch (error) {
    console.error("خطأ في Get_One_Classification:", error.message);
    res.status(500).json({ message: "تأكد من اتصالك بالانترنت" });
  }
};

/**
 * إنشاء/تحديث مستند تصنيفات مادة: تستبدل مصفوفة الأسئلة كاملة بالواردة
 * (لوحة التحكم تحرر المصفوفة محلياً وترسلها جاهزة). إن لم يوجد مستند
 * للمادة يُنشأ (upsert) — وهذا أيضاً مسار "إنشاء مستند" في اللوحة.
 * العناصر غير الصالحة (بلا نص أو بتصنيف غير معروف) تُتجاهل.
 *
 * PUT /updateclassifications
 * body: { PASSWORD, subject_id, questions: [...], subject_name? }
 */
export const Update_Classifications = async (req, res) => {
  try {
    const { PASSWORD, subject_id, questions, subject_name } = req.body;
    if (!check_admin_password(PASSWORD)) {
      return res.status(401).json({ message: "تعذر حفظ البيانات" });
    }
    if (!subject_id) {
      return res.status(400).json({ message: "رمز المادة ناقص" });
    }
    if (!Array.isArray(questions)) {
      return res.status(400).json({ message: "مصفوفة الأسئلة ناقصة" });
    }

    const clean = questions.map(clean_entry).filter((e) => e !== null);
    const skipped = questions.length - clean.length;

    let doc = await QuestionClassifications.findOne({
      subject_id: String(subject_id),
    });
    if (!doc) {
      doc = new QuestionClassifications({
        subject_id: String(subject_id),
        questions: [],
      });
    }

    if (typeof subject_name === "string" && subject_name.trim()) {
      doc.subject_name = subject_name;
    } else if (!doc.subject_name) {
      // حاول جلب اسم المادة من كولكشن المواد لتسهيل التصفح
      const exam = await Exams.findOne({ _id: subject_id }, { name: 1 }).lean();
      if (exam) doc.subject_name = exam.name || "";
    }

    doc.questions = clean;
    doc.updated_at = new Date();
    await doc.save();

    res.status(200).json({
      message: "تم حفظ التصنيفات",
      skipped,
      doc: doc.toObject(),
    });
  } catch (error) {
    console.error("خطأ في Update_Classifications:", error.message);
    res.status(500).json({ message: "تأكد من اتصالك بالانترنت" });
  }
};

/**
 * حذف مستند تصنيفات مادة بالكامل.
 *
 * DELETE /deleteclassifications  body: { PASSWORD, subject_id }
 */
export const Delete_Classifications = async (req, res) => {
  try {
    const { PASSWORD, subject_id } = req.body;
    if (!check_admin_password(PASSWORD)) {
      return res.status(401).json({ message: "تعذر حذف المستند" });
    }
    if (!subject_id) {
      return res.status(400).json({ message: "رمز المادة ناقص" });
    }

    const doc = await QuestionClassifications.findOneAndDelete({
      subject_id: String(subject_id),
    });
    if (!doc) {
      return res.status(404).json({ message: "لا يوجد مستند تصنيفات لهذه المادة" });
    }

    res.status(200).json({ message: "تم حذف مستند التصنيفات" });
  } catch (error) {
    console.error("خطأ في Delete_Classifications:", error.message);
    res.status(500).json({ message: "تأكد من اتصالك بالانترنت" });
  }
};
