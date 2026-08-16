import mongoose from "mongoose";

// ─── المحاضرات المؤرشفة ───────────────────────────────────────────────────────
// الدكتور يحذف محاضرةً من المقرَّر في منتصف الفصل فتصير غير مطلوبة، وهي
// موجودةٌ في خطط الطلاب وفي المادة. حذفها نهائياً يُضيّع عمل إنتاجها كلّه،
// وإبقاؤها يُحمّل الطالب ما لا يُمتحَن به.
//
// فتُنقَل إلى هنا **كاملةً** بمحتواها ومعرّف مادتها، فتخرج من المادة ومن
// مزامنة الخطط، وتعود بضغطة زرّ إن أعاد الدكتور تقريرها.
//
// `Mixed` للمحاضرة عمداً: هيكلها يتطوّر مع المادة، وschema ثابتٌ هنا كان
// سيُسقط حقلاً أضيف حديثاً **صامتاً** — والمؤرشَف يُستعاد بعد شهور.

const ARCHIVED_LECTURE_SCHEMA = new mongoose.Schema(
  {
    subject_id: { type: String, required: true, index: true },
    subject_name: { type: String, default: "" },
    college_id: { type: String, default: "" },
    lecture_id: { type: String, required: true },
    name: { type: String, default: "" },
    /** كيان المحاضرة كما كان في المادة حرفياً */
    lecture: { type: mongoose.Schema.Types.Mixed, required: true },
    archived_at: { type: Date, default: Date.now },
  },
  { collection: "archived_lectures" },
);

ARCHIVED_LECTURE_SCHEMA.index({ subject_id: 1, lecture_id: 1 });

export default mongoose.model("ArchivedLecture", ARCHIVED_LECTURE_SCHEMA);
