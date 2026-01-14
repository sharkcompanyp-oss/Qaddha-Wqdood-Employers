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

    // ==================== 1. الوقت المنقضي ÷ عدد الاختبارات ====================
    let totalTime = 0;
    let totalTests = 0;

    All_Students.forEach((student) => {
      totalTime += student.time || 0;
      totalTests += student.scores?.length || 0;
    });

    const avgTimePerTest =
      totalTests > 0 ? (totalTime / totalTests).toFixed(2) : 0;

    // ==================== 2. نسبة الإكمال لكل مادة ====================
    const completionRatePerSubject = All_Exams.map((subject) => {
      // عدد الطلاب المسجلين
      const registeredStudents = subject.available_to?.length || 0;

      // عدد الطلاب اللي عملوا الاختبار
      const studentsWithScores = All_Students.filter((student) =>
        student.scores?.some((score) => score.subject_id == subject.ID)
      ).length;

      const completionRate =
        registeredStudents > 0
          ? ((studentsWithScores / registeredStudents) * 100).toFixed(2)
          : 0;

      return {
        subject_id: subject.ID,
        subject_name: subject.name,
        registered_students: registeredStudents,
        students_with_scores: studentsWithScores,
        completion_rate: `${completionRate}%`,
      };
    });

    // ==================== 3. متوسط النتيجة لكل مادة ====================
    const avgScorePerSubject = All_Exams.map((subject) => {
      const scoresForSubject = [];

      All_Students.forEach((student) => {
        student.scores?.forEach((score) => {
          if (score.subject_id == subject.ID) {
            scoresForSubject.push(score.score);
          }
        });
      });

      const avg =
        scoresForSubject.length > 0
          ? (
              scoresForSubject.reduce((a, b) => a + b, 0) /
              scoresForSubject.length
            ).toFixed(2)
          : 0;

      return {
        subject_id: subject.ID,
        subject_name: subject.name,
        avg_score: parseFloat(avg),
        total_attempts: scoresForSubject.length,
      };
    });

    // ==================== 4. الوقت ÷ النتيجة لكل مادة ====================
    const timeToScoreRatio = All_Exams.map((subject) => {
      let totalTimeForSubject = 0;
      let totalScoreForSubject = 0;
      let count = 0;

      All_Students.forEach((student) => {
        student.scores?.forEach((score) => {
          if (score.subject_id == subject.ID) {
            // نفترض أن وقت المادة هو من Subject.time
            totalTimeForSubject += subject.time || 0;
            totalScoreForSubject += score.score || 0;
            count++;
          }
        });
      });

      const avgTime = count > 0 ? totalTimeForSubject / count : 0;
      const avgScore = count > 0 ? totalScoreForSubject / count : 0;
      const ratio = avgScore > 0 ? (avgTime / avgScore).toFixed(2) : 0;

      return {
        subject_id: subject.ID,
        subject_name: subject.name,
        avg_time: parseFloat(avgTime.toFixed(2)),
        avg_score: parseFloat(avgScore.toFixed(2)),
        time_to_score_ratio: parseFloat(ratio),
      };
    });

    // ==================== 5. عدد المحاولات / العودة ====================
    const retryAnalysis = All_Exams.map((subject) => {
      let studentsWithRetries = 0;
      let totalRetries = 0;

      All_Students.forEach((student) => {
        const attemptsForSubject =
          student.scores?.filter((score) => score.subject_id == subject.ID) ||
          [];

        if (attemptsForSubject.length > 1) {
          studentsWithRetries++;
          totalRetries += attemptsForSubject.length - 1; // عدد المحاولات الإضافية
        }
      });

      return {
        subject_id: subject.ID,
        subject_name: subject.name,
        students_with_retries: studentsWithRetries,
        total_retries: totalRetries,
        avg_retries_per_student:
          studentsWithRetries > 0
            ? (totalRetries / studentsWithRetries).toFixed(2)
            : 0,
      };
    });

    // ==================== 6. ربحية كل مادة ====================
    const profitPerSubject = All_Exams.map((subject) => {
      const studentsCount = subject.available_to?.length || 0;
      const freeSubscriptions = subject.number_of_free_subscriptions || 0;
      const price = subject.price || 0;

      // ✅ الأرباح الحقيقية = (عدد الطلاب - عدد المجانيين) × السعر
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
      0
    );
    const totalStudents = All_Students.length;
    const totalExams = All_Exams.length;

    // ==================== الاستجابة ====================
    res.status(200).json({
      success: true,
      analytics: {
        general: {
          total_students: totalStudents,
          total_exams: totalExams,
          total_admins: All_Admins.length,
          avg_time_per_test: parseFloat(avgTimePerTest),
          total_profit: totalProfit,
        },
        completion_rates: completionRatePerSubject,
        average_scores: avgScorePerSubject,
        time_to_score_ratios: timeToScoreRatio,
        retry_analysis: retryAnalysis,
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
