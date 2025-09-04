import mongoose from "mongoose";
const ADMIN_SCHEMA = mongoose.Schema({
  name: { type: String, default: "رشيد حداد" },
  password: { type: String, default: "Rh3Cr7Rh3Cr7" },
  total_profit: { type: Number, default: 490000 },
  profits: {
    type: [
      {
        subject_id: { type: Number },
        price: { type: Number },
        subscribers: { type: Number },
      },
    ],
  },
});

export default mongoose.model("Admin", ADMIN_SCHEMA);
