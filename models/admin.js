import mongoose from "mongoose";
const ADMIN_SCHEMA = mongoose.Schema({
  name: { type: String, required: true },
  phone_number: { type: String, required: true },
  password: { type: String, required: true },
  total_profit: { type: Number, required: false, default: 0 },
});

export default mongoose.model("Admin", ADMIN_SCHEMA);
