import Subjects from "../models/exam.js";
import Students from "../models/student.js";
import Admins from "../models/admin.js";

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const Get_Analytics = async (req, res) => {
  try {
    const All_Exams = await Subjects.find();
    const All_Students = await Students.find();
    const All_Admins = await Admins.find();

    // ==================== ربحية كل مادة ====================
    const profitPerSubject = All_Exams.map((subject) => {
      const studentsCount = subject.available_to?.length || 0;
      const freeSubscriptions = subject.number_of_free_subscriptions || 0;
      const price = subject.price || 0;

      const paidStudents = studentsCount - freeSubscriptions;
      const totalProfit = paidStudents * price;

      return {
        subject_id: subject.ID,
        subject_name: subject.name,
        price: price,
        enrolled_students: studentsCount,
        total_profit: totalProfit,
      };
    });

    // ==================== إجمالي الإحصائيات ====================
    const totalProfit = profitPerSubject.reduce(
      (sum, item) => sum + item.total_profit,
      0,
    );

    // ==================== الاستجابة ====================
    res.status(200).json({
      success: true,
      analytics: {
        general: {
          total_students: All_Students.length,
          total_exams: All_Exams.length,
          total_admins: All_Admins.length,
          total_profit: totalProfit,
        },
        profit_per_subject: profitPerSubject,
      },
    });
  } catch (error) {
    console.error("خطأ في تحليل البيانات:", error);
    res.status(500).json({
      success: false,
      message: "حدث خطأ، تحقق من اتصالك بالإنترنت",
      error: error.message,
    });
  }
};
