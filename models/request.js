import mongoose from "mongoose";
const REQUEST_SCHEMA = mongoose.Schema({
  student_ID: { type: String, required: true },
  exams_ids: { type: [String], required: true },
  college_id: { type: String, required: false },
  university_id: { type: String, required: false },
  total_price: { type: Number, required: true },
  process_id: { type: String, required: true },
  student_notes: { type: String, required: false, default: "" },
  status: { type: String, required: false, default: "pending" },
  our_notes: { type: String, required: false, default: "" },
});

export default mongoose.model("Request", REQUEST_SCHEMA);
