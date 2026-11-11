import mongoose from "mongoose";

// ─── تنبيه أجهزة (قراءة فقط من لوحة التحكم) ──────────────────────────────────
// يكتبه باك اند الطلاب (`EXAMS/backend/models/DeviceAlert.js`):
//   concurrent        جلستان للحساب نفسه استُخدمتا في الفترة نفسها
//   new_device_login  دخولٌ بمعرّف جهاز غير الذي سُجّل أول مرة (تشخيص)
const DEVICE_ALERT_SCHEMA = new mongoose.Schema(
  {
    key: String,
    kind: String,
    student: mongoose.Schema.Types.ObjectId,
    student_ID: Number,
    name: String,
    level: String,
    reasons: [String],
    switches: Number,
    first_at: Date,
    last_at: Date,
  },
  { strict: false, autoIndex: false, collection: "device_alerts" },
);

export default mongoose.models.DeviceAlert ||
  mongoose.model("DeviceAlert", DEVICE_ALERT_SCHEMA);
