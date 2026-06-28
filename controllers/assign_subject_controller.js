import Exams from "../models/exam.js";
import Employers from "../models/employer.js";
import dotenv from "dotenv";

dotenv.config();

/**
 * تسليم مادة لعضو: يضبط حقل employer للمادة على _id العضو.
 * تمرير employer_id = null يلغي التسليم.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const Assign_Subject_To_Employer = async (req, res) => {
  try {
    const { PASSWORD, exam_id, employer_id } = req.body;

    if (!PASSWORD || PASSWORD !== process.env.PASSWORD) {
      return res.status(401).json({ message: "تعذر تسليم المادة" });
    }
    if (!exam_id) {
      return res.status(400).json({ message: "معرّف المادة ناقص" });
    }

    const exam = await Exams.findById(exam_id);
    if (!exam) {
      return res.status(404).json({ message: "المادة غير موجودة" });
    }

    // إن لم يكن إلغاء تسليم، نتحقق من وجود العضو
    if (employer_id) {
      const employer = await Employers.findById(employer_id);
      if (!employer) {
        return res.status(404).json({ message: "العضو غير موجود" });
      }
    }

    exam.employer = employer_id ? String(employer_id) : null;
    await exam.save();

    res.status(200).json({
      message: employer_id ? "تم تسليم المادة للعضو" : "تم إلغاء التسليم",
      exam_id: String(exam._id),
      employer: exam.employer,
    });
  } catch (error) {
    console.error("خطأ في Assign_Subject_To_Employer:", error.message);
    res.status(500).json({ message: "تأكد من اتصالك بالانترنت" });
  }
};
