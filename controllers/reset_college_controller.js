import Exams from "../models/exam.js";
import dotenv from "dotenv";

dotenv.config();

// ─── تصفير كلية في نهاية الفصل ────────────────────────────────────────────────
// يُفرِّغ اشتراكات كل مواد الكلية: available_to و available_to_moadal.
// المحتوى لا يُمَسّ إطلاقاً — الأسئلة والملخصات والمحاضرات تبقى للفصل القادم.
//
// عملية لا رجعة فيها، فلها حارسان: معاينة تُظهر ما سيقع قبل وقوعه،
// وتأكيدٌ صريح بكلمة يكتبها المستخدم.

const guard = (req, res) => {
  const { PASSWORD } = req.body || {};
  if (!PASSWORD || PASSWORD !== process.env.PASSWORD) {
    res.status(401).json({ message: "غير مصرّح" });
    return false;
  }
  return true;
};

const matchCollege = (college_id) => {
  const n = Number(college_id);
  return {
    college_id: Number.isNaN(n)
      ? String(college_id)
      : { $in: [n, String(college_id)] },
  };
};

/** معاينة: ماذا سيقع لو نُفِّذ التصفير؟ لا يكتب شيئاً. */
export const Preview_Reset_College = async (req, res) => {
  try {
    if (!guard(req, res)) return;
    const { college_id } = req.body;
    if (college_id === undefined || college_id === null || college_id === "") {
      return res.status(400).json({ message: "رمز الكلية مطلوب" });
    }

    const rows = await Exams.aggregate([
      { $match: matchCollege(college_id) },
      {
        $project: {
          name: 1,
          students: { $size: { $ifNull: ["$available_to", []] } },
          moadal: { $size: { $ifNull: ["$available_to_moadal", []] } },
        },
      },
      { $sort: { students: -1 } },
    ]);

    return res.status(200).json({
      subjects: rows,
      count: rows.length,
      total_students: rows.reduce((s, r) => s + r.students, 0),
      total_moadal: rows.reduce((s, r) => s + r.moadal, 0),
    });
  } catch (error) {
    console.error("Preview_Reset_College:", error);
    return res.status(500).json({ message: "تعذّرت المعاينة" });
  }
};

/** التنفيذ: يفرّغ الاشتراكات وحدها. */
export const Reset_College = async (req, res) => {
  try {
    if (!guard(req, res)) return;
    const { college_id, confirm } = req.body;
    if (college_id === undefined || college_id === null || college_id === "") {
      return res.status(400).json({ message: "رمز الكلية مطلوب" });
    }
    // التأكيد بكلمةٍ يكتبها المستخدم: نقرةٌ واحدة لا تكفي لعمل لا رجعة فيه
    if (String(confirm || "").trim() !== "تصفير") {
      return res.status(400).json({
        message: 'اكتب «تصفير» في خانة التأكيد لتنفيذ العملية',
      });
    }

    const before = await Exams.aggregate([
      { $match: matchCollege(college_id) },
      {
        $group: {
          _id: null,
          subjects: { $sum: 1 },
          students: { $sum: { $size: { $ifNull: ["$available_to", []] } } },
          moadal: { $sum: { $size: { $ifNull: ["$available_to_moadal", []] } } },
        },
      },
    ]);

    const r = await Exams.updateMany(matchCollege(college_id), {
      // الاشتراكات وحدها. المحتوى والأسعار والظهور لا تُمَسّ.
      $set: { available_to: [], available_to_moadal: [] },
    });

    const b = before[0] || { subjects: 0, students: 0, moadal: 0 };
    console.log(
      `[تصفير] كلية ${college_id}: ${r.modifiedCount} مادة · ${b.students} اشتراك · ${b.moadal} معدل`,
    );

    return res.status(200).json({
      message: "تمّ التصفير",
      matched: r.matchedCount,
      modified: r.modifiedCount,
      cleared_students: b.students,
      cleared_moadal: b.moadal,
    });
  } catch (error) {
    console.error("Reset_College:", error);
    return res
      .status(500)
      .json({ message: "تعذّر التصفير", error: error.message });
  }
};
