import mongoose from "mongoose";
const COMPLAINT_SCHEMA = mongoose.Schema({
  student_ID: { type: String, required: true },
  type: { type: String, required: true },
  section_id: { type: String, required: false },
  lecture_name: { type: String, required: false },
  subject_name: { type: String, required: false },
  college_name: { type: String, required: false },
  university_name: { type: String, required: false },
  question: { type: String, required: false },
  student_name: { type: String, required: false },
  whatsapp_number: { type: String, required: false },
  complaint: { type: String, required: false },
});

export default mongoose.model("complaint", COMPLAINT_SCHEMA);
