import Exams from "../models/exam.js";

// ─── الرقم التسلسلي للمادة (ID) ───────────────────────────────────────────────
// `ID` مخزَّن نصّاً، وكان التالي يُحسب بـ sort({ ID: -1 }) — ترتيبٌ أبجديّ
// يجعل "9" أكبر من "10" و"99" أكبر من "120"، فيُعطى رقمٌ موجود أصلاً لمادةٍ
// جديدة. هنا يُحوَّل كلٌّ إلى عدد قبل أخذ الأكبر؛ وما ليس رقماً يُعدّ صفراً.

export const nextSubjectID = async () => {
  const [r] = await Exams.aggregate([
    {
      $group: {
        _id: null,
        max: {
          $max: { $convert: { input: "$ID", to: "long", onError: 0, onNull: 0 } },
        },
      },
    },
  ]);
  return String(Number(r?.max || 0) + 1);
};
