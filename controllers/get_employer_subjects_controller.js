import Exams from "../models/exam.js";

/**
 * جلب المواد المخصّصة لعضو معيّن فقط (حيث exam.employer == employer_id).
 * يدعم بحثاً اختيارياً بالاسم/الرمز ضمن مواد العضو.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const Get_Employer_Subjects = async (req, res) => {
  try {
    const { employer_id, searchTerm } = req.body;

    if (!employer_id) {
      return res.status(400).json({ message: "معرّف العضو ناقص" });
    }

    const query = { employer: String(employer_id) };

    if (searchTerm) {
      const regex = new RegExp(searchTerm, "i");
      query.$or = [{ name: regex }, { ID: searchTerm }];
    }

    // نجلب فقط ما يحتاجه العضو: الأسئلة + الاسم + المعرّفات.
    // نستبعد الحقول غير القابلة للتعديل والثقيلة (خصوصاً summary) توفيراً للسيرفر.
    const projection = {
      name: 1,
      ID: 1,
      employer: 1,
      questions: 1,
    };

    const exams = await Exams.find(query, projection);
    res.json(exams);
  } catch (error) {
    console.error("خطأ في Get_Employer_Subjects:", error.message);
    res.status(500).json({ message: "تأكد من اتصالك بالانترنت" });
  }
};
