import Subjects from "../models/exam.js";
import Students from "../models/student.js";
import Admins from "../models/admin.js";
import Refund from "../models/refund.js";
import { REVENUE_STAGES } from "../services/revenue.js";

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
    const [rows, total_students, total_admins, refundRows] = await Promise.all([
      Subjects.aggregate([
        ...REVENUE_STAGES,
        { $sort: { total_profit: -1 } },
      ]),
      Students.estimatedDocumentCount(),
      Admins.estimatedDocumentCount(),
      Refund.aggregate([
        { $group: { _id: "$exam_id", amount: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
    ]);

    // المرتجعات تُعرض بسطرها وحدها ولا تُطرح من الأرباح هنا — طرحها يجري في
    // نسبة العضو فقط. تُلحق بكل مادة كي يسري عليها الاستبعاد في الواجهة.
    const refundsBy = Object.fromEntries(refundRows.map((r) => [String(r._id), r]));
    rows.forEach((r) => {
      r.refunds = refundsBy[r.sid]?.amount || 0;
      r.refunds_count = refundsBy[r.sid]?.count || 0;
      delete r.employer;
    });
    const totalRefunds = rows.reduce((s, r) => s + r.refunds, 0);

    const totalProfit = rows.reduce((s, r) => s + (r.total_profit || 0), 0);

    return res.status(200).json({
      success: true,
      analytics: {
        general: {
          total_students,
          total_exams: rows.length,
          total_admins,
          total_profit: totalProfit,
          total_refunds: totalRefunds,
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
