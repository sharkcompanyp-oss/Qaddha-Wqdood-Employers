import Exams from "../models/exam.js";
import LectureText from "../models/lecture_text.js";
import dotenv from "dotenv";

dotenv.config();

// ─── ربط نصوص المقرَّرات يدوياً ────────────────────────────────────────────────
// ملفات كولكشن lecturetexts مسمّاة بأرقام مجلدات اللابتوب (1.md، 2.md…)
// ولا تطابق أسماء المحاضرات في الملخص والأسئلة. فالمطابقة الآلية تخمينٌ
// يربط نصّاً بمحاضرة خاطئة صامتاً — وهو أسوأ من ألّا يُربط.
//
// لذلك: تُعرض الملفات، ويختار المستخدم لكلٍّ مادته ومحاضرته بعينه،
// فيُنقل النصّ إلى كائن المحاضرة ويُحذف من الكولكشن القديم.
// عمليةٌ لمرّة واحدة تنتهي بإفراغ الكولكشن.

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

/** قائمة النصوص غير المربوطة — بلا نقل النصّ نفسه (قد يكون 50 ألف حرف) */
export const List_Unlinked_Texts = async (req, res) => {
  try {
    if (!guard(req, res)) return;
    const { search } = req.body;

    const match = {};
    if (String(search || "").trim()) {
      const rx = new RegExp(String(search).trim(), "i");
      match.$or = [{ subject: rx }, { file: rx }, { section: rx }];
    }

    const rows = await LectureText.aggregate([
      { $match: match },
      {
        $project: {
          section: 1,
          subject: 1,
          file: 1,
          rel_path: 1,
          chars: 1,
          updated_at: 1,
          // مقتطف يكفي للتعرّف على المحاضرة بلا نقل النصّ كلّه
          preview: { $substrCP: [{ $ifNull: ["$text", ""] }, 0, 400] },
          word_count: 1,
        },
      },
      { $sort: { subject: 1, file: 1 } },
    ]);

    return res.status(200).json({ texts: rows, count: rows.length });
  } catch (error) {
    console.error("List_Unlinked_Texts:", error);
    return res.status(500).json({ message: "تعذّر جلب النصوص" });
  }
};

/** نصّ واحد كاملاً — للقراءة قبل الربط */
export const Get_Text_Full = async (req, res) => {
  try {
    if (!guard(req, res)) return;
    const { rel_path } = req.body;
    if (!rel_path) return res.status(400).json({ message: "المسار مطلوب" });
    const doc = await LectureText.findOne({ rel_path }).lean();
    if (!doc) return res.status(404).json({ message: "النصّ غير موجود" });
    return res.status(200).json({
      rel_path: doc.rel_path,
      file: doc.file,
      subject: doc.subject,
      section: doc.section,
      text: doc.text || "",
      chars: doc.chars || 0,
    });
  } catch (error) {
    return res.status(500).json({ message: "تعذّر جلب النصّ" });
  }
};

/**
 * يربط نصّاً بمحاضرة: ينقله إلى lectures[].curriculum ثم يحذفه من الكولكشن.
 * الحذف بعد التأكّد من الكتابة — لا قبله.
 */
export const Link_Text_To_Lecture = async (req, res) => {
  try {
    if (!guard(req, res)) return;
    const { rel_path, subject_id, lecture_id, keep_source } = req.body;
    if (!rel_path) return res.status(400).json({ message: "مسار النصّ مطلوب" });
    if (!subject_id) return res.status(400).json({ message: "المادة مطلوبة" });
    if (!lecture_id) return res.status(400).json({ message: "المحاضرة مطلوبة" });

    const txt = await LectureText.findOne({ rel_path });
    if (!txt) return res.status(404).json({ message: "النصّ غير موجود" });

    const exam = await Exams.findById(subject_id);
    if (!exam) return res.status(404).json({ message: "المادة غير موجودة" });

    const lec = (exam.lectures || []).find(
      (l) => String(l.lecture_id) === String(lecture_id),
    );
    if (!lec) return res.status(404).json({ message: "المحاضرة غير موجودة" });

    // تحذير لا منع: قد يريد المستخدم استبدال نصّ ربطه خطأً
    const had = String(lec.curriculum?.text || "").trim().length > 0;

    const text = String(txt.text || "");
    lec.curriculum = {
      text,
      source_file: String(txt.file || ""),
      word_count: words(text),
      updated_at: new Date(),
    };

    await exam.save();

    // الحذف بعد نجاح الحفظ فقط — العكس يفقد النصّ إن فشلت الكتابة
    let deleted = false;
    if (!keep_source) {
      await LectureText.deleteOne({ rel_path });
      deleted = true;
    }

    const remaining = await LectureText.countDocuments();

    return res.status(200).json({
      message: had ? "استُبدل النصّ" : "رُبط النصّ",
      replaced: had,
      words: lec.curriculum.word_count,
      deleted_source: deleted,
      remaining,
    });
  } catch (error) {
    console.error("Link_Text_To_Lecture:", error);
    return res
      .status(500)
      .json({ message: "تعذّر الربط", error: error.message });
  }
};
