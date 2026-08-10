import Subjects from "../models/exam.js";
import Students from "../models/student.js";
import Admins from "../models/admin.js";

// ─── الإحصائيات ───────────────────────────────────────────────────────────────
// كانت ثلاثة find() بلا حدود: تُنزل **كل** وثيقة كاملةً — بأسئلتها وملخصاتها
// ومحاضراتها ونصوصها — ثم لا تستعمل منها إلا ستة حقول عددية.
// المادة الواحدة ~294 ك.ب، فمئة مادة تعني ~29 م.ب على السلك في كل فتحة للشاشة.
//
// الآن: العدّ يحدث في القاعدة ($size لا نقل المصفوفة)، والطلاب والأدمن
// يُعدّون بـcountDocuments بلا نقل وثيقة واحدة.

export const Get_Analytics = async (req, res) => {
  try {
    // ثلاثتها مستقلّة، فتُنفَّذ معاً لا بالتتابع
    const [rows, total_students, total_admins] = await Promise.all([
      Subjects.aggregate([
        {
          $project: {
            _id: 0,
            subject_id: "$ID",
            subject_name: "$name",
            college_id: 1,
            price: { $ifNull: ["$price", 0] },
            price_moadal: { $ifNull: ["$price_moadal", 0] },
            enrolled_students: { $size: { $ifNull: ["$available_to", []] } },
            // مشتركو «معدل» يُحسبون بسعرهم الخاص: كانوا خارج الحساب كلياً
            // فتظهر مادةٌ بيعت خطتها بأرباح صفر.
            moadal_students: {
              $size: { $ifNull: ["$available_to_moadal", []] },
            },
            free: { $ifNull: ["$number_of_free_subscriptions", 0] },
          },
        },
        {
          // الربح = (المشتركون − المجانيون) × السعر، ولا يقلّ عن صفر:
          // المجانيون قد يتجاوزون المشتركين في مادة تجريبية فيخرج رقم سالب
          // يُنقص الإجمالي بلا معنى.
          // ويُضاف إليه ربح خطة «معدل» بسعرها المستقل.
          $addFields: {
            profit_tarfi3: {
              $multiply: [
                { $max: [0, { $subtract: ["$enrolled_students", "$free"] }] },
                "$price",
              ],
            },
            profit_moadal: {
              $multiply: ["$moadal_students", "$price_moadal"],
            },
          },
        },
        {
          $addFields: {
            total_profit: { $add: ["$profit_tarfi3", "$profit_moadal"] },
          },
        },
        { $project: { free: 0 } },
        { $sort: { total_profit: -1 } },
      ]),
      Students.estimatedDocumentCount(),
      Admins.estimatedDocumentCount(),
    ]);

    const totalProfit = rows.reduce((s, r) => s + (r.total_profit || 0), 0);

    return res.status(200).json({
      success: true,
      analytics: {
        general: {
          total_students,
          total_exams: rows.length,
          total_admins,
          total_profit: totalProfit,
        },
        profit_per_subject: rows,
      },
    });
  } catch (error) {
    console.error("خطأ في تحليل البيانات:", error);
    return res.status(500).json({
      success: false,
      message: "حدث خطأ، تحقق من اتصالك بالإنترنت",
      error: error.message,
    });
  }
};
