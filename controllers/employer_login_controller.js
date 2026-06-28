import Employers from "../models/employer.js";

/**
 * تسجيل دخول الموظف عبر رقم الموبايل + الكلمات الثلاث.
 * عند النجاح يعيد _id الموظف وبياناته الأساسية.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const Employer_Login = async (req, res) => {
  try {
    const { phone_number, password1, password2, password3 } = req.body;

    if (!phone_number || !password1 || !password2 || !password3) {
      return res
        .status(400)
        .json({ message: "الرجاء إدخال رقم الموبايل والكلمات الثلاث" });
    }

    const employer = await Employers.findOne({ phone_number });

    if (!employer) {
      return res.status(401).json({ message: "بيانات الدخول غير صحيحة" });
    }

    const ok =
      employer.password1 === password1 &&
      employer.password2 === password2 &&
      employer.password3 === password3;

    if (!ok) {
      return res.status(401).json({ message: "بيانات الدخول غير صحيحة" });
    }

    return res.status(200).json({
      message: "تم تسجيل الدخول بنجاح",
      employer: {
        _id: employer._id,
        name: employer.name,
        phone_number: employer.phone_number,
      },
    });
  } catch (error) {
    console.error("خطأ في Employer_Login:", error.message);
    res.status(500).json({ message: "تأكد من اتصالك بالانترنت" });
  }
};
