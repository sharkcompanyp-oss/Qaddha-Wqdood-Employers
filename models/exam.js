import mongoose from "mongoose";
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
});

export default mongoose.model("Subjects", SUBJECTS_SCHEMA);
