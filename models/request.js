import mongoose from "mongoose";
const REQUEST_SCHEMA = mongoose.Schema({
  name: { type: String, required: true },
  college_id: { type: Number, required: true },
  info: { type: String },
  time: { type: Number, required: true },
  visible: { type: Boolean, default: false },
  open_mode: { type: Boolean, default: false },
  price: { type: Number, default: 0 },
  admin_id: { type: String, required: false },
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

export default mongoose.model("Request", REQUEST_SCHEMA);
