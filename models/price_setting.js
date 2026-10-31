import mongoose from "mongoose";

// ─── أسعار النماذج المعدَّلة ──────────────────────────────────────────────────
// وثيقة واحدة (key: "default") تحمل جدول الأسعار كاملاً كما حُفظ من اللوحة.
// غيابها يعني أسعار المصنع في `services/costs.js`.

const price_setting_schema = new mongoose.Schema(
  {
    key: { type: String, default: "default", unique: true, index: true },
    prices: { type: mongoose.Schema.Types.Mixed, default: null },
    /** نسبة العضو: { usd_rate: ليرة لكل دولار, share_pct: النسبة المئوية } */
    finance: { type: mongoose.Schema.Types.Mixed, default: null },
    updated_at: { type: Date, default: Date.now },
  },
  { collection: "price_settings" },
);

export default mongoose.model("PriceSetting", price_setting_schema);
