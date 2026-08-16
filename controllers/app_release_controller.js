import AppRelease from "../models/app_release.js";

// ─── إعلان التحديث ────────────────────────────────────────────────────────────
// القراءة **مفتوحة بلا مصادقة**: يستدعيها تطبيق الطالب، وهو لا يملك كلمة
// اللوحة. ولا تكشف الوثيقة شيئاً حسّاساً — رايةٌ ورابط.
//
// الكتابة من اللوحة وحدها.

const guard = (req, res) => {
  const { PASSWORD } = req.body || {};
  if (!PASSWORD || PASSWORD !== process.env.PASSWORD) {
    res.status(401).json({ message: "غير مصرّح" });
    return false;
  }
  return true;
};

/** يقرؤها التطبيق في خلفية الإقلاع */
export const Get_App_Release = async (req, res) => {
  try {
    const doc = await AppRelease.findOne({ key: "default" }).lean();
    return res.status(200).json({
      update_required: Boolean(doc?.update_required),
      update_url: doc?.update_url || "",
      message: doc?.message || "",
      version: doc?.version || "",
    });
  } catch (e) {
    // الإخفاق لا يُعطّل التطبيق: نقول «لا تحديث» ونمضي
    return res
      .status(200)
      .json({ update_required: false, update_url: "", message: "", version: "" });
  }
};

/** ضبطها من اللوحة */
export const Update_App_Release = async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const { update_required, update_url, message, version } = req.body || {};
    const set = { updated_at: new Date() };
    if (update_required !== undefined)
      set.update_required = Boolean(update_required);
    if (update_url !== undefined) set.update_url = String(update_url || "").trim();
    if (message !== undefined) set.message = String(message || "").trim();
    if (version !== undefined) set.version = String(version || "").trim();

    // رايةٌ مرفوعة بلا رابط تُظهر للطالب مودالاً لا مخرج منه
    if (set.update_required && !(set.update_url || "").trim()) {
      const current = await AppRelease.findOne({ key: "default" }).lean();
      if (!current?.update_url) {
        return res
          .status(400)
          .json({ message: "ضع رابط التحديث قبل تفعيله — وإلا حُبس الطالب في مودالٍ بلا مخرج" });
      }
    }

    const doc = await AppRelease.findOneAndUpdate(
      { key: "default" },
      { $set: set },
      { new: true, upsert: true },
    ).lean();

    return res.status(200).json({
      message: "حُفظ إعلان التحديث",
      setting: {
        update_required: Boolean(doc.update_required),
        update_url: doc.update_url || "",
        message: doc.message || "",
        version: doc.version || "",
      },
    });
  } catch (e) {
    return res
      .status(500)
      .json({ message: "تعذّر الحفظ", error: e.message });
  }
};
