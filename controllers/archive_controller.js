import ArchivedLecture from "../models/archived_lecture.js";
import Exams from "../models/exam.js";
import { isPanel } from "../services/access.js";

// ─── أرشفة المحاضرات واستعادتها ───────────────────────────────────────────────
// نقلٌ لا حذف: المحاضرة تخرج من المادة بكامل محتواها إلى مجموعة مستقلة،
// وتعود منها بضغطة زرّ. عملُ إنتاجها لا يضيع لأن الدكتور غيّر رأيه.
//
// ── للّوحة وحدها ──
// ليست من صلاحيات العضو: هي قرارُ مقرِّرٍ على بنية المادة لا عملُ إنتاج.
// و`allowSubject` وحدها لا تكفي هنا — فهي تقبل العضو الذي **استُلمت له**
// المادة، وتطبيق الأعضاء لا يعرض الزرّ لكنّ الحدّ يجب أن يكون في الخادم
// لا في إخفاء زرّ.

/** يؤرشف محاضرة: تُنقل من المادة إلى مجموعة الأرشيف */
export const Archive_Lecture = async (req, res) => {
  try {
    const { _id, lecture_id } = req.body || {};
    if (!isPanel(req)) {
      return res.status(401).json({ message: "الأرشفة من صلاحيات اللوحة وحدها" });
    }
    if (!_id) return res.status(400).json({ message: "رمز المادة ناقص" });
    if (!lecture_id)
      return res.status(400).json({ message: "رمز المحاضرة ناقص" });

    const exam = await Exams.findById(_id);
    if (!exam) return res.status(404).json({ message: "المادة غير موجودة" });

    const idx = (exam.lectures || []).findIndex(
      (l) => String(l.lecture_id) === String(lecture_id),
    );
    if (idx === -1)
      return res.status(404).json({ message: "المحاضرة غير موجودة" });

    // نسخةٌ عادية قبل النزع: كائن Mongoose المنزوع يفقد توابعه
    const lec = exam.lectures[idx].toObject
      ? exam.lectures[idx].toObject()
      : exam.lectures[idx];

    // الأرشفة أوّلاً ثم النزع: لو انعكس الترتيب وأخفقت الكتابة لضاعت
    // المحاضرة بلا رجعة.
    await ArchivedLecture.findOneAndUpdate(
      { subject_id: String(_id), lecture_id: String(lecture_id) },
      {
        $set: {
          subject_id: String(_id),
          subject_name: exam.name || "",
          college_id: String(exam.college_id ?? ""),
          lecture_id: String(lecture_id),
          name: lec.name || "",
          lecture: lec,
          archived_at: new Date(),
        },
      },
      { upsert: true, new: true },
    );

    exam.lectures.splice(idx, 1);
    await exam.save();

    return res.status(200).json({
      message: `أُرشفت «${lec.name || "المحاضرة"}»`,
      lecture_id: String(lecture_id),
      remaining: exam.lectures.length,
    });
  } catch (e) {
    console.error("Archive_Lecture:", e);
    return res
      .status(500)
      .json({ message: "تعذّرت الأرشفة", error: e.message });
  }
};

/** يعيد محاضرةً مؤرشفة إلى مادتها — آخر الترتيب */
export const Restore_Lecture = async (req, res) => {
  try {
    const { archive_id } = req.body || {};
    if (!archive_id)
      return res.status(400).json({ message: "رمز الأرشيف ناقص" });

    const row = await ArchivedLecture.findById(archive_id).lean();
    if (!row) return res.status(404).json({ message: "غير موجود في الأرشيف" });

    if (!isPanel(req)) {
      return res.status(401).json({ message: "الاستعادة من صلاحيات اللوحة وحدها" });
    }

    const exam = await Exams.findById(row.subject_id);
    if (!exam)
      return res.status(404).json({ message: "مادة المحاضرة لم تعد موجودة" });

    exam.lectures = exam.lectures || [];
    const exists = exam.lectures.some(
      (l) => String(l.lecture_id) === String(row.lecture_id),
    );
    if (exists) {
      return res
        .status(409)
        .json({ message: "المحاضرة موجودة في المادة أصلاً" });
    }

    // آخر الترتيب: الاستعادة لا تُعيد ترتيباً قديماً قد يكون تغيّر
    const maxOrder = exam.lectures.reduce(
      (m, l) => Math.max(m, Number(l.order) || 0),
      0,
    );
    exam.lectures.push({ ...row.lecture, order: maxOrder + 1 });
    await exam.save();

    await ArchivedLecture.deleteOne({ _id: archive_id });

    return res.status(200).json({
      message: `أُعيدت «${row.name || "المحاضرة"}» إلى ${exam.name}`,
      subject_id: String(row.subject_id),
    });
  } catch (e) {
    console.error("Restore_Lecture:", e);
    return res
      .status(500)
      .json({ message: "تعذّرت الإعادة", error: e.message });
  }
};

/** قائمة الأرشيف — بلا محتوى المحاضرات (ثقيل ولا يُعرض) */
export const List_Archived = async (req, res) => {
  try {
    if (!isPanel(req)) {
      return res.status(401).json({ message: "غير مصرّح" });
    }
    const rows = await ArchivedLecture.find({})
      .select("subject_id subject_name college_id lecture_id name archived_at")
      .sort({ archived_at: -1 })
      .lean();
    return res.status(200).json({ archived: rows, count: rows.length });
  } catch (e) {
    console.error("List_Archived:", e);
    return res
      .status(500)
      .json({ message: "تعذّر جلب الأرشيف", error: e.message });
  }
};
