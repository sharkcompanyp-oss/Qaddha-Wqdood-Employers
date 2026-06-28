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
    },
    sections: [SectionSchema],
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
  questions: {
    type: [
      {
        question: { type: String, required: true },
        options: { type: [String], required: true },
        answer: { type: String, required: true },
        lecture: { type: String, required: false, default: "" },
      },
    ],
  },
  summary: { type: [SummarySchema], required: false, default: null },
});

export default mongoose.model("Subjects", SUBJECTS_SCHEMA);
