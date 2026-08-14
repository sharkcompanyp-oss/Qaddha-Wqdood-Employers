/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
import Exams from "../models/exam.js";
import dotenv from "dotenv";
import { employerOf, isPanel } from "../services/access.js";

dotenv.config();

export const Get_Exams = async (req, res) => {
  const { searchTerm, PASSWORD } = req.body;
  try {
    let exams;
    if (!PASSWORD || PASSWORD !== process.env.PASSWORD) {
      // `return` إلزامي: بدونه يُرسل 401 ثم يُكمل التنفيذ فيُرسل
      // كل المواد لطلب غير مصرَّح له — البوابة كانت شكلية لا فعلية.
      return res.status(401).json({ message: "تعذر جلب المادة" });
    }
    if (searchTerm) {
      const regex = new RegExp(searchTerm, "i"); // بحث غير حساس لحالة الأحرف
      exams = await Exams.find({
        $or: [{ name: regex }, { ID: searchTerm }],
      });
    } else {
      exams = await Exams.find();
    }

    res.json(exams);
  } catch (error) {
    console.error("خطأ في Get_Exams:", error.message); // سجل الخطأ
    res.status(500).json({ message: "تأكد من اتصالك بالانترنت" });
  }
};

// ─── الجلب التدريجي ──────────────────────────────────────────────────────────
// القائمة تحتاج ~0.1 KB للمادة، والجلب الحالي يرسل ~294 KB — هدر 3000:1.
// نُبقي Get_Exams كما هو (يستهلكه عميلان)، ونضيف مسارين خفيفين بجانبه.

const guard = (req, res) => {
  const { PASSWORD } = req.body;
  if (!PASSWORD || PASSWORD !== process.env.PASSWORD) {
    res.status(401).json({ message: "غير مصرّح" });
    return false;
  }
  return true;
};

/** الكليات التي بها مواد فعلاً + عدد مواد كل كلية.
 *  لا كيان «كلية» في القاعدة — الأسماء تأتي من ملف الواجهة Collegues.js،
 *  فنعيد المعرّفات والأعداد فقط ويطابقها العميل. */
export const Get_Exams_Tree = async (req, res) => {
  try {
    // العضو يرى كليّات موادّه وحدها: عدّادٌ يشمل موادّ غيره يعده بما لا يبلغه
    const panel = isPanel(req);
    const emp = panel ? null : await employerOf(req);
    if (!panel && !emp) {
      return res.status(401).json({ message: "غير مصرّح" });
    }
    const rows = await Exams.aggregate([
      ...(emp ? [{ $match: { employer: String(emp._id) } }] : []),
      { $group: { _id: "$college_id", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    return res.status(200).json({
      colleges: rows.map((r) => ({
        // college_id رقم في المادة ونص في ملف الكليات — نوحّده نصاً
        college_id: r._id === null || r._id === undefined ? "" : String(r._id),
        count: r.count,
      })),
      total: rows.reduce((s, r) => s + r.count, 0),
    });
  } catch (error) {
    console.error("Get_Exams_Tree:", error.message);
    return res.status(500).json({ message: "تعذّر جلب الشجرة" });
  }
};

/** أسماء مواد كلية واحدة — بلا أسئلة ولا ملخص ولا محاضرات.
 *  الأعداد تُحسب في القاعدة بـ$size فلا تُنقل المصفوفات إطلاقاً. */
export const Get_Exams_Names = async (req, res) => {
  try {
    if (!guard(req, res)) return;
    const { college_id, searchTerm } = req.body;

    const match = {};
    if (college_id !== undefined && college_id !== null && college_id !== "") {
      // المطابقة على الشكلين: الحقل رقم في وثائق قديمة ونص في أخرى
      const n = Number(college_id);
      match.college_id = Number.isNaN(n)
        ? String(college_id)
        : { $in: [n, String(college_id)] };
    }
    if (searchTerm) {
      const rx = new RegExp(searchTerm, "i");
      match.$or = [{ name: rx }, { ID: String(searchTerm) }];
    }

    const exams = await Exams.aggregate([
      { $match: match },
      {
        $project: {
          name: 1,
          ID: 1,
          info: 1,
          college_id: 1,
          price: 1,
          price_moadal: 1,
          visible: 1,
          moadal_available: 1,
          employer: 1,
          // الأعداد تُشتقّ من المحاضرات بعد توحيد الهيكل. كانت تُحسب من
          // `$questions` و`$summary` على مستوى المادة — وقد حُذفا بالهجرة،
          // فصار كل عدّاد صفراً في كل مادة بلا أن يظهر خطأ.
          questions_count: {
            $sum: {
              $map: {
                input: { $ifNull: ["$lectures", []] },
                as: "l",
                in: { $size: { $ifNull: ["$$l.questions", []] } },
              },
            },
          },
          lectures_count: { $size: { $ifNull: ["$lectures", []] } },
          summary_count: {
            $size: {
              $filter: {
                input: { $ifNull: ["$lectures", []] },
                as: "l",
                cond: {
                  $gt: [
                    { $size: { $ifNull: ["$$l.summary.sections", []] } },
                    0,
                  ],
                },
              },
            },
          },
          students_count: { $size: { $ifNull: ["$available_to", []] } },
        },
      },
      { $sort: { name: 1 } },
    ]);

    return res.status(200).json({ exams, count: exams.length });
  } catch (error) {
    console.error("Get_Exams_Names:", error.message);
    return res.status(500).json({ message: "تعذّر جلب أسماء المواد" });
  }
};

/** فهرس عالمي خفيف (ID → name) — تحتاجه شاشات الطلاب والمتصدرين
 *  بغضّ النظر عن الكلية المختارة، فلا يجوز أن يكسرها التدرّج. */
export const Get_Exams_Index = async (req, res) => {
  try {
    if (!guard(req, res)) return;
    const rows = await Exams.aggregate([
      { $project: { name: 1, ID: 1, college_id: 1 } },
    ]);
    return res.status(200).json({ exams: rows, count: rows.length });
  } catch (error) {
    console.error("Get_Exams_Index:", error.message);
    return res.status(500).json({ message: "تعذّر جلب الفهرس" });
  }
};
