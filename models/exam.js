import mongoose from "mongoose";

// ─── Lecture Summary Sub-Schemas ───────────────────────────────────────────────

const ContentItemSchema = new mongoose.Schema(
  {
    text: { type: String },
    keywords: [{ type: String }],
    is_example: { type: Boolean },
    strong: { type: String },
    emoji: { type: String },
    title: { type: String },
    description: { type: String },
    type: { type: String },
    items: [
      {
        text: { type: String },
        keywords: [{ type: String }],
        is_example: { type: Boolean },
        strong: { type: String },
        emoji: { type: String },
        title: { type: String },
        description: { type: String },
        type: { type: String },
        items: [
          {
            text: { type: String },
            keywords: [{ type: String }],
          },
        ],
      },
    ],
  },
  { _id: false },
);

const ContentBlockSchema = new mongoose.Schema(
  {
    type: { type: String, required: false },
    emoji: { type: String },
    text: { type: String },
    label: { type: String },
    title: { type: String },
    badge: { type: String },
    style: { type: String },
    items: [ContentItemSchema],
  },
  { _id: false },
);

const NoteSchema = new mongoose.Schema(
  {
    student_ID: { type: String, required: false, default: "" },
    student_nick_name: { type: String, required: false, default: "" },
    note: { type: String, required: false, default: "" },
  },
  { _id: false },
);

const SectionSchema = new mongoose.Schema(
  {
    id: { type: String, required: false, default: "" },
    number: { type: Number, required: false, default: 0 },
    title: { type: String, required: false, default: "" }, // ← شيل required
    content_blocks: [ContentBlockSchema],
    notes: [NoteSchema],
  },
  { _id: false },
);

const SummarySchema = new mongoose.Schema(
  {
    meta: {
      lecture_title: { type: String, required: false, default: "" }, // ← شيل required
      lecture_id: { type: String, required: false, default: "" }, // ربط بكيان المحاضرة
    },
    sections: [SectionSchema],
  },
  { _id: false },
);

// ─── Lecture Entity Sub-Schemas ────────────────────────────────────────────────
// كيان المحاضرة الموحّد: يربط نص المقرر والملخص والأسئلة والفلاش كاردز
// والاختبار التحريري تحت هوية واحدة (lecture_id) — أساس خطة «معدل».

const FlashCardSchema = new mongoose.Schema(
  {
    card_id: { type: String, required: true },
    front: { type: String, required: false, default: "" },
    back: { type: String, required: false, default: "" },
  },
  { _id: false },
);

// سؤال الاختبار التحريري: الجواب النموذجي يُخزَّن هنا لوكيل التصحيح فقط
// ولا يُرسَل إلى تطبيق الطالب أبداً.
const WrittenQuestionSchema = new mongoose.Schema(
  {
    q_id: { type: String, required: true },
    question: { type: String, required: false, default: "" },
    model_answer: { type: String, required: false, default: "" },
  },
  { _id: false },
);

// سؤال اختيار من متعدّد داخل المحاضرة. q_id معرّف ثابت لا يتغيّر:
// تقدّم الطالب يُسجَّل عليه، فلو اعتمدنا الموضع لانزاح التقدّم كلّه
// عند حذف سؤال واحد — صامتاً.
const McqSchema = new mongoose.Schema(
  {
    q_id: { type: String, required: true },
    question: { type: String, required: false, default: "" },
    options: { type: [String], required: false, default: () => ["", "", "", ""] },
    answer: { type: String, required: false, default: "" },
  },
  { _id: false },
);

// نصّ المقرَّر — كان في كولكشن LectureText منفصلاً يُطابَق بمسارٍ نصّي.
// ضمّه هنا يجعل المحاضرة مصدراً واحداً، والجلب بالنطاق يمنع نقله لمن
// لا يطلبه (انظر Get_One_Subject).
const CurriculumSchema = new mongoose.Schema(
  {
    text: { type: String, required: false, default: "" },
    source_file: { type: String, required: false, default: "" },
    word_count: { type: Number, required: false, default: 0 },
    updated_at: { type: Date, required: false, default: null },
  },
  { _id: false },
);

// ملخص المحاضرة — كان subject.summary[] يُطابَق بالعنوان النصّي
const LectureSummarySchema = new mongoose.Schema(
  {
    sections: { type: [SectionSchema], default: [] },
    word_count: { type: Number, required: false, default: 0 },
  },
  { _id: false },
);

// ─── كيان المحاضرة الموحَّد ───────────────────────────────────────────────────
// كل ما يخصّ المحاضرة في كائنها: النصّ والملخص والأسئلة والبطاقات والتحريري.
// المطابقة بـlecture_id وحده في كل قارئ — الاسم للعرض لا للربط.
//
// قبل هذا كان المحتوى موزَّعاً على أربعة مواضع بأربعة مفاتيح مختلفة
// (مسار نصّي، عنوان ملخص، اسم مجموعة أسئلة، معرّف)، فحرفٌ يختلف في اسمٍ
// يعني محتوىً معلّقاً لا يراه الطالب ولا يظهر إلا في شكوى.
const LectureSchema = new mongoose.Schema(
  {
    lecture_id: { type: String, required: true },
    name: { type: String, required: false, default: "" },
    order: { type: Number, required: false, default: 0 },

    curriculum: { type: CurriculumSchema, default: () => ({}) },
    summary: { type: LectureSummarySchema, default: () => ({}) },
    questions: { type: [McqSchema], default: [] },
    flash_cards: { type: [FlashCardSchema], default: [] },
    written_exam: {
      duration_min: { type: Number, required: false, default: 30 },
      questions: { type: [WrittenQuestionSchema], default: [] },
    },

    // حقول الهيكل القديم — تبقى للقراءة أثناء الانتقال ثم تُهمَل.
    // حذفها الآن يكسر أي قارئ لم يُحدَّث بعد.
    title: { type: String, required: false },
    text_ref: { type: String, required: false },
    questions_lecture_name: { type: String, required: false },
  },
  { _id: false },
);

// ─── Main Schema ───────────────────────────────────────────────────────────────

const SUBJECTS_SCHEMA = mongoose.Schema({
  name: { type: String, required: true },
  ID: { type: String, required: false },
  college_id: { type: Number, required: true },
  info: { type: String },
  time: { type: Number, required: true },
  visible: { type: Boolean, default: false },
  available_to: { type: Array, default: [] },
  // مشتركو خطة «معدل» (يملكون أيضاً كل ما في «ترفيع» — موجودون في available_to كذلك)
  available_to_moadal: { type: Array, default: [] },
  open_mode: { type: Boolean, default: false },
  price: { type: Number, default: 0 },
  admin_id: {
    type: String,
    required: false,
    default: "6934998caad4fa6ea1e59d31",
  },
  // _id العضو المُسلّمة له هذه المادة (إن وُجد)
  employer: {
    type: String,
    required: false,
    default: null,
  },
  number_of_free_subscriptions: { type: Number, required: false, default: 0 },
  total_profit: { type: Number, required: false, default: 0 },
  // ─── المصدر الواحد ───
  lectures: { type: [LectureSchema], default: [] },

  // أسئلة لا تنتمي لأي محاضرة — للمراجعة لا للعرض على الطالب.
  // لا تُحذف: قد تكون محتوىً صالحاً فُقد ربطه، والحذف لا رجعة فيه.
  orphan_questions: {
    type: [
      {
        question: { type: String, default: "" },
        options: { type: [String], default: () => ["", "", "", ""] },
        answer: { type: String, default: "" },
        was_lecture: { type: String, default: "" },
      },
    ],
    default: [],
  },

  // ─── الهيكل القديم: يبقى للقراءة أثناء الانتقال ───
  // بعد الهجرة تصير فارغة. لا تُحذف من المخطط قبل تحديث كل قارئ.
  questions: {
    type: [
      {
        question: { type: String, required: false },
        options: { type: [String], required: false },
        answer: { type: String, required: false },
        lecture: { type: String, required: false, default: "" },
        lecture_id: { type: String, required: false, default: "" },
      },
    ],
    default: undefined,
  },
  summary: { type: [SummarySchema], required: false, default: null },
  // سعر خطة «معدل» (price الحالي = سعر خطة «ترفيع»)
  price_moadal: { type: Number, required: false, default: 0 },
  // مشتق آلياً عند حفظ المحاضرات: كل محاضرة مكتملة الأنواع الخمسة
  moadal_available: { type: Boolean, required: false, default: false },
});

export default mongoose.model("Subjects", SUBJECTS_SCHEMA);
