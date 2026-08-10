import mongoose from "mongoose";
const REQUEST_SCHEMA = mongoose.Schema({
  student_ID: { type: String, required: true },
  exams_ids: { type: [String], required: true },
  // خطة كل مادة: [{ exam_id, tier: "tarfee" | "moadal" }] — غيابها = ترفيع
  tiers: {
    type: [
      {
        exam_id: { type: String },
        tier: { type: String, default: "tarfee" },
        _id: false,
      },
    ],
    default: [],
  },
  college_id: { type: String, required: false },
  university_id: { type: String, required: false },
  total_price: { type: Number, required: true },
  process_id: { type: String, required: true },
  student_notes: { type: String, required: false, default: "" },
  status: { type: String, required: false, default: "pending" },
  our_notes: { type: String, required: false, default: "" },
  // تواريخ الطلب — تُنسخ إلى بيانات الخطة لتُحسم بها مطالبات الاسترداد
  // بلا بحثٍ في سجلّات أخرى. بدونها لم يكن للطلب تاريخ أصلاً.
  created_at: { type: Date, default: Date.now },
  accepted_at: { type: Date, default: null },
});

export default mongoose.model("Request", REQUEST_SCHEMA);
