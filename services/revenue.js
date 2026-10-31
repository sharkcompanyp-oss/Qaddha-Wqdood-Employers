// ─── إيرادات المادة ───────────────────────────────────────────────────────────
// مصدرٌ واحد للحساب تقرؤه الإحصائيات ونسبة العضو معاً — لو اختلفا لظهر
// للعضو رقمٌ غير الذي في الإحصائيات.
//
// مراحل aggregate تُلحق بعد أي $match على Exams، وتُخرج لكل مادة:
//   tarfee_students · moadal_students · enrolled_students
//   profit_tarfi3 · profit_moadal · total_profit
// (total_profit = الإيراد: (الترفيع − مجانيّيه) × سعره + (المعدل − مجانيّيه) × سعره)

export const REVENUE_STAGES = [
  {
    $project: {
      _id: 0,
      // مفتاح ثابت للمادة — الاستبعاد المحلي في الواجهة يُخزَّن به
      sid: { $toString: "$_id" },
      subject_id: "$ID",
      subject_name: "$name",
      college_id: 1,
      employer: 1,
      price: { $ifNull: ["$price", 0] },
      price_moadal: { $ifNull: ["$price_moadal", 0] },
      free: { $ifNull: ["$number_of_free_subscriptions", 0] },
      free_moadal: { $ifNull: ["$number_of_free_moadal_subscriptions", 0] },
      // الأرقام الجامعية نصاً وبلا تكرار: القوائم تحمل الرقم نصاً
      // أحياناً ورقماً أحياناً، فبدون التوحيد يُعدّ الطالب مرتين.
      tarfee_ids: {
        $setUnion: [
          {
            $map: {
              input: { $ifNull: ["$available_to", []] },
              as: "x",
              in: { $toString: "$$x" },
            },
          },
        ],
      },
      moadal_ids: {
        $setUnion: [
          {
            $map: {
              input: { $ifNull: ["$available_to_moadal", []] },
              as: "x",
              in: { $toString: "$$x" },
            },
          },
        ],
      },
    },
  },
  {
    // مشترك «معدل» يُكتب في القائمتين معاً (available_to و
    // available_to_moadal)، لكنه دفع سعر «معدل» وحده لا السعرين.
    // كان يُعدّ في ربح الترفيع ثم يُضاف ربح المعدل فوقه — اشتراكٌ
    // واحد يُحسب مرتين. الترفيع الآن = من في available_to وليس معدلاً.
    $addFields: {
      tarfee_students: {
        $size: { $setDifference: ["$tarfee_ids", "$moadal_ids"] },
      },
      moadal_students: { $size: "$moadal_ids" },
      enrolled_students: {
        $size: { $setUnion: ["$tarfee_ids", "$moadal_ids"] },
      },
    },
  },
  {
    // الربح = (مشتركو الترفيع − المجانيون) × السعر، ولا يقلّ عن صفر:
    // المجانيون قد يتجاوزون المشتركين في مادة تجريبية فيخرج رقم سالب
    // يُنقص الإجمالي بلا معنى.
    // ويُضاف إليه ربح خطة «معدل» بسعرها المستقل، بعد طرح مجانيّيها
    // (الاشتراك بالنقاط أو المجاني اليدوي) بالطريقة نفسها.
    $addFields: {
      profit_tarfi3: {
        $multiply: [
          { $max: [0, { $subtract: ["$tarfee_students", "$free"] }] },
          "$price",
        ],
      },
      profit_moadal: {
        $multiply: [
          {
            $max: [0, { $subtract: ["$moadal_students", "$free_moadal"] }],
          },
          "$price_moadal",
        ],
      },
    },
  },
  {
    $addFields: {
      total_profit: { $add: ["$profit_tarfi3", "$profit_moadal"] },
    },
  },
  { $project: { tarfee_ids: 0, moadal_ids: 0 } },
];
