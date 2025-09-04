import mongoose from "mongoose";
const STUDENT_SCHEMA = mongoose.Schema({
  name: { type: String, required: true },
  ID: { type: Number, required: true },
  college_id: { type: Number },
  password: { type: String, required: true },
  nick_name: { type: String, default: "John Doe" },
  points: { type: Number, default: 0 },
  badge: { type: String, default: "فارش" },
  scores: {
    type: [
      {
        subject_id: { type: Number },
        score: { type: Number },
        is_open_mode: { type: Boolean },
      },
    ],
    default: [],
  },
});

export default mongoose.model("Student", STUDENT_SCHEMA);
