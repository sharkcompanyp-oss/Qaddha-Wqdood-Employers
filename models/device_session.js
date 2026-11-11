import mongoose from "mongoose";

// ─── جلسة جهاز (قراءة + حظر من لوحة التحكم) ──────────────────────────────────
// المالك الحقيقي للمخطط هو باك اند الطلاب (`EXAMS/backend/models/DeviceSession.js`):
// هو من يكتب الجلسات ويُنشئ الفهارس، ويفحص `blocked` عند تسجيل الدخول وعند
// جلب المواد. هنا نقرأ ونكتب حقول الحظر فقط.
//
// `strict: false` كي لا يُسقَط حقلٌ لا نعرفه، و`autoIndex: false` كي لا
// تتنازع لوحتان على فهارس المجموعة نفسها. اسم المجموعة صريح.
const DEVICE_SESSION_SCHEMA = new mongoose.Schema(
  {
    sid: String,
    student: mongoose.Schema.Types.ObjectId,
    student_ID: Number,
    name: String,
    origin: String,
    login_at: Date,
    login_device: String,
    platform: String,
    device: String,
    ua: String,
    push: String,
    last_ip: String,
    ips: [String],
    first_seen: Date,
    last_seen: Date,
    hits: Number,
    blocked: Boolean,
    blocked_at: Date,
    blocked_hits: Number,
    blocked_seen_at: Date,
  },
  { strict: false, autoIndex: false, collection: "device_sessions" },
);

export default mongoose.models.DeviceSession ||
  mongoose.model("DeviceSession", DEVICE_SESSION_SCHEMA);
