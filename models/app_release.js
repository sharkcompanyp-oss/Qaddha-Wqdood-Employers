import mongoose from "mongoose";

// ─── إصدار التطبيق ────────────────────────────────────────────────────────────
// وثيقة واحدة (key: "default") تقول: أثمّة تحديثٌ مطلوب، وأين رابطه.
//
// مستقلّة عن Expo عمداً: تحديثات Expo الهوائية تُبدّل حزمة الجافاسكربت
// وحدها، ولا تنفع حين يتغيّر شيءٌ أصلي (حزمة جديدة، صلاحية، إصدار متجر).
// هذه رسالةٌ صريحة منك إلى الطالب: «حمّل النسخة الجديدة من هنا».

const APP_RELEASE_SCHEMA = new mongoose.Schema(
  {
    key: { type: String, default: "default", unique: true, index: true },
    /** هل نعرض المودال؟ */
    update_required: { type: Boolean, default: false },
    /** رابط التحميل المباشر */
    update_url: { type: String, default: "" },
    /** نصّ اختياري يظهر في المودال — ما الجديد أو سبب الإلزام */
    message: { type: String, default: "" },
    version: { type: String, default: "" },
    updated_at: { type: Date, default: Date.now },
  },
  { collection: "app_release" },
);

export default mongoose.model("AppRelease", APP_RELEASE_SCHEMA);
