import Exams from "../models/exam.js";

/**
 * جلب المواد المخصّصة لموظف معيّن فقط (حيث exam.employer == employer_id).
 * يدعم بحثاً اختيارياً بالاسم/الرمز ضمن مواد الموظف.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const Get_Employer_Subjects = async (req, res) => {
  try {
    const { employer_id, searchTerm } = req.body;

    if (!employer_id) {
      return res.status(400).json({ message: "معرّف الموظف ناقص" });
    }

    const query = { employer: String(employer_id) };

    if (searchTerm) {
      const regex = new RegExp(searchTerm, "i");
      query.$or = [{ name: regex }, { ID: searchTerm }];
    }

    const exams = await Exams.find(query);
    res.json(exams);
  } catch (error) {
    console.error("خطأ في Get_Employer_Subjects:", error.message);
    res.status(500).json({ message: "تأكد من اتصالك بالانترنت" });
  }
};
