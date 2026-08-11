import mongoose from "mongoose";
import Exams from "../models/exam.js";
import dotenv from "dotenv";

dotenv.config();

// ─── جلب المادة بالنطاق — الهيكل الموحَّد ─────────────────────────────────────
// المحاضرة صارت تحمل كل شيء بما فيه نصّ المقرَّر (~50 ألف حرف لكل محاضرة).
// نقل ذلك في كل طلب هدرٌ فادح، فالانتقاء يجري **في القاعدة** عبر
// $project + $map — لا تُنقَل الحقول غير المطلوبة على السلك إطلاقاً.
//
// النطاقات:
//   list        حقول المادة + أعداد محسوبة (بلا محتوى)
//   tarfi3      الملخص والأسئلة لكل محاضرة (خطة ترفيع) — بلا نصوص ولا بطاقات
//   moadal      كل شيء عدا نصوص المقرَّر (تُجلب بالنطاق curriculum عند فتحها)
//   full        كل شيء بما فيه النصوص
//   lecture     محاضرة واحدة كاملة (يلزم lecture_id)
//   curriculum  نصّ محاضرة واحدة وحده (يلزم lecture_id)

const LIGHT = {
  name: 1,
  ID: 1,
  info: 1,
  college_id: 1,
  time: 1,
  visible: 1,
  open_mode: 1,
  price: 1,
  price_moadal: 1,
  moadal_available: 1,
  admin_id: 1,
  employer: 1,
  number_of_free_subscriptions: 1,
  // قائمة المسجَّلين: تعديلها من لوحة بيانات المادة يحتاج قراءتها أولاً.
  // بدونها كان الحقل يصل فارغاً فيُحفَظ فارغاً — أي إلغاء تسجيل الجميع.
  available_to: 1,
  available_to_moadal: 1,
};

/** اسم المحاضرة: name هو الحقل المعتمد، وtitle بقيّة من الهيكل القديم.
 *  محاضرات هاجرت بـtitle وحده كانت تظهر بلا اسم في كل شاشة وفي الخطة
 *  الدراسية — والطالب يرى مهامّ بلا عنوان. الرجوع إلى title هنا يعالج
 *  كل القرّاء دفعةً واحدة بدل ترقيع كل شاشة على حدة. */
const LECTURE_NAME = {
  $cond: [
    { $gt: [{ $strLenCP: { $ifNull: ["$$l.name", ""] } }, 0] },
    "$$l.name",
    { $ifNull: ["$$l.title", ""] },
  ],
};

/** يبني تعبير $map يختار الحقول المطلوبة من كل محاضرة */
const mapLectures = (fields) => ({
  $map: {
    input: { $ifNull: ["$lectures", []] },
    as: "l",
    in: fields.reduce(
      (acc, f) => {
        acc[f] = `$$l.${f}`;
        return acc;
      },
      {
        lecture_id: "$$l.lecture_id",
        name: LECTURE_NAME,
        order: "$$l.order",
      },
    ),
  },
});

/** أعداد المحتوى بلا نقله — أساس مؤشّر الاكتمال وجاهزية «معدل» */
const COUNTS = {
  $map: {
    input: { $ifNull: ["$lectures", []] },
    as: "l",
    in: {
      lecture_id: "$$l.lecture_id",
      name: LECTURE_NAME,
      order: "$$l.order",
      has_curriculum: {
        $gt: [{ $strLenCP: { $ifNull: ["$$l.curriculum.text", ""] } }, 0],
      },
      summary_sections: {
        $size: { $ifNull: ["$$l.summary.sections", []] },
      },
      questions_count: { $size: { $ifNull: ["$$l.questions", []] } },
      flash_count: { $size: { $ifNull: ["$$l.flash_cards", []] } },
      written_count: {
        $size: { $ifNull: ["$$l.written_exam.questions", []] },
      },
      curriculum_words: { $ifNull: ["$$l.curriculum.word_count", 0] },
      summary_words: { $ifNull: ["$$l.summary.word_count", 0] },
    },
  },
};

const SCOPES = {
  list: { ...LIGHT, lectures: COUNTS },
  tarfi3: { ...LIGHT, lectures: mapLectures(["summary", "questions"]) },
  moadal: {
    ...LIGHT,
    lectures: mapLectures(["summary", "questions", "flash_cards", "written_exam"]),
  },
  full: { ...LIGHT, lectures: 1, orphan_questions: 1 },
};

export const Get_Subject_V2 = async (req, res) => {
  try {
    const { _id, scope = "list", lecture_id } = req.body || {};
    if (!_id) return res.status(400).json({ message: "معرّف المادة مطلوب" });
    if (!mongoose.isValidObjectId(_id)) {
      return res.status(400).json({ message: "معرّف المادة غير صالح" });
    }

    const oid = new mongoose.Types.ObjectId(_id);

    // نطاقا المحاضرة الواحدة: نرشّح المصفوفة قبل الانتقاء فلا تُنقَل غيرها
    if (scope === "lecture" || scope === "curriculum") {
      if (!lecture_id) {
        return res.status(400).json({ message: "معرّف المحاضرة مطلوب" });
      }
      const project =
        scope === "curriculum"
          ? { lecture_id: "$$l.lecture_id", name: LECTURE_NAME, curriculum: "$$l.curriculum" }
          : {
              lecture_id: "$$l.lecture_id",
              name: LECTURE_NAME,
              order: "$$l.order",
              curriculum: "$$l.curriculum",
              summary: "$$l.summary",
              questions: "$$l.questions",
              flash_cards: "$$l.flash_cards",
              written_exam: "$$l.written_exam",
            };

      const rows = await Exams.aggregate([
        { $match: { _id: oid } },
        {
          $project: {
            name: 1,
            lectures: {
              $map: {
                input: {
                  $filter: {
                    input: { $ifNull: ["$lectures", []] },
                    as: "l",
                    cond: { $eq: ["$$l.lecture_id", String(lecture_id)] },
                  },
                },
                as: "l",
                in: project,
              },
            },
          },
        },
      ]);

      const doc = rows[0];
      if (!doc) return res.status(404).json({ message: "المادة غير موجودة" });
      const lec = (doc.lectures || [])[0];
      if (!lec) return res.status(404).json({ message: "المحاضرة غير موجودة" });
      return res.status(200).json({ _id: doc._id, name: doc.name, lecture: lec });
    }

    const projection = SCOPES[scope] || SCOPES.list;
    const rows = await Exams.aggregate([
      { $match: { _id: oid } },
      { $project: projection },
    ]);
    const doc = rows[0];
    if (!doc) return res.status(404).json({ message: "المادة غير موجودة" });

    // الترتيب في الذاكرة: المصفوفة صغيرة بعد الانتقاء، و$sortArray
    // يحتاج إصداراً حديثاً من Mongo فلا نعتمد عليه.
    if (Array.isArray(doc.lectures)) {
      doc.lectures.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }
    return res.status(200).json(doc);
  } catch (err) {
    console.error("Get_Subject_V2:", err);
    return res.status(500).json({ message: "حدث خطأ في الخادم." });
  }
};

/** أسماء مواد كلية — بلا أي محتوى، للقائمة وحدها */
export const Get_Subjects_List_V2 = async (req, res) => {
  try {
    const { PASSWORD, college_id } = req.body || {};
    if (!PASSWORD || PASSWORD !== process.env.PASSWORD) {
      return res.status(401).json({ message: "غير مصرّح" });
    }
    const match = {};
    if (college_id !== undefined && college_id !== null && college_id !== "") {
      const n = Number(college_id);
      match.college_id = Number.isNaN(n)
        ? String(college_id)
        : { $in: [n, String(college_id)] };
    }

    const exams = await Exams.aggregate([
      { $match: match },
      {
        $project: {
          ...LIGHT,
          lectures_count: { $size: { $ifNull: ["$lectures", []] } },
          students_count: { $size: { $ifNull: ["$available_to", []] } },
          moadal_students: { $size: { $ifNull: ["$available_to_moadal", []] } },
          orphan_count: { $size: { $ifNull: ["$orphan_questions", []] } },
          // مجموع الأسئلة عبر المحاضرات بلا نقل سؤال واحد
          questions_count: {
            $sum: {
              $map: {
                input: { $ifNull: ["$lectures", []] },
                as: "l",
                in: { $size: { $ifNull: ["$$l.questions", []] } },
              },
            },
          },
        },
      },
      { $sort: { name: 1 } },
    ]);
    return res.status(200).json({ exams, count: exams.length });
  } catch (err) {
    console.error("Get_Subjects_List_V2:", err);
    return res.status(500).json({ message: "تعذّر جلب المواد" });
  }
};
