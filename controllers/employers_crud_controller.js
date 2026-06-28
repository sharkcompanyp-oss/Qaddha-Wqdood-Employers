import Employers from "../models/employer.js";
import Exams from "../models/exam.js";
import dotenv from "dotenv";

dotenv.config();

// تحقق بسيط من كلمة مرور لوحة التحكم الأساسية (نفس نمط باقي طلبات المدير)
const check_admin_password = (PASSWORD) =>
  PASSWORD && PASSWORD === process.env.PASSWORD;

/**
 * جلب كل الموظفين مع تقرير مفصّل: المواد المستلمة، الوقت المنقضي لكل مادة،
 * والوقت الإجمالي. يُعرض كل شيء (بما فيه الكلمات الثلاث) للمدير.
 */
export const Get_Employers = async (req, res) => {
  try {
    const { PASSWORD } = req.body;
    if (!check_admin_password(PASSWORD)) {
      return res.status(401).json({ message: "تعذر جلب الموظفين" });
    }

    const employers = await Employers.find().lean();

    // أسماء المواد المخصّصة حالياً لكل موظف
    const assigned = await Exams.find(
      { employer: { $ne: null } },
      { name: 1, ID: 1, employer: 1 },
    ).lean();

    const subjectsByEmployer = {};
    assigned.forEach((ex) => {
      const key = String(ex.employer);
      if (!subjectsByEmployer[key]) subjectsByEmployer[key] = [];
      subjectsByEmployer[key].push({ _id: ex._id, name: ex.name, ID: ex.ID });
    });

    const report = employers.map((emp) => {
      const sessions = emp.sessions || [];
      const total_elapsed_seconds = sessions.reduce(
        (sum, s) => sum + (Number(s.elapsed_seconds) || 0),
        0,
      );
      return {
        ...emp,
        assigned_subjects: subjectsByEmployer[String(emp._id)] || [],
        total_elapsed_seconds,
      };
    });

    res.json(report);
  } catch (error) {
    console.error("خطأ في Get_Employers:", error.message);
    res.status(500).json({ message: "تأكد من اتصالك بالانترنت" });
  }
};

/**
 * إضافة موظف جديد (المدير فقط).
 */
export const Add_Employer = async (req, res) => {
  try {
    const { PASSWORD, name, phone_number, password1, password2, password3 } =
      req.body;
    if (!check_admin_password(PASSWORD)) {
      return res.status(401).json({ message: "تعذر إضافة الموظف" });
    }
    if (!name || !phone_number || !password1 || !password2 || !password3) {
      return res.status(400).json({
        message: "الحقول المطلوبة: الاسم، رقم الموبايل، والكلمات الثلاث",
      });
    }

    const exists = await Employers.findOne({ phone_number });
    if (exists) {
      return res
        .status(409)
        .json({ message: "يوجد موظف مسجّل بهذا الرقم مسبقاً" });
    }

    const new_employer = new Employers({
      name,
      phone_number,
      password1,
      password2,
      password3,
    });
    await new_employer.save();

    res
      .status(201)
      .json({ message: "تمت إضافة الموظف بنجاح", employer: new_employer });
  } catch (error) {
    console.error("خطأ في Add_Employer:", error.message);
    res.status(500).json({ message: "تأكد من اتصالك بالانترنت" });
  }
};

/**
 * تحديث بيانات موظف (المدير فقط) — بما فيها الكلمات الثلاث في حالات الطوارئ.
 */
export const Update_Employer = async (req, res) => {
  try {
    const {
      PASSWORD,
      _id,
      name,
      phone_number,
      password1,
      password2,
      password3,
    } = req.body;
    if (!check_admin_password(PASSWORD)) {
      return res.status(401).json({ message: "تعذر تعديل الموظف" });
    }
    if (!_id) {
      return res.status(400).json({ message: "معرّف الموظف ناقص" });
    }

    const employer = await Employers.findById(_id);
    if (!employer) {
      return res.status(404).json({ message: "الموظف غير موجود" });
    }

    if (name !== undefined) employer.name = name;
    if (phone_number !== undefined) employer.phone_number = phone_number;
    if (password1 !== undefined) employer.password1 = password1;
    if (password2 !== undefined) employer.password2 = password2;
    if (password3 !== undefined) employer.password3 = password3;

    await employer.save();

    res.status(200).json({ message: "تم تعديل بيانات الموظف", employer });
  } catch (error) {
    console.error("خطأ في Update_Employer:", error.message);
    res.status(500).json({ message: "تأكد من اتصالك بالانترنت" });
  }
};

/**
 * حذف موظف (المدير فقط). تُفكّ تخصيصات المواد المرتبطة به.
 */
export const Delete_Employer = async (req, res) => {
  try {
    const { PASSWORD, _id } = req.body;
    if (!check_admin_password(PASSWORD)) {
      return res.status(401).json({ message: "تعذر حذف الموظف" });
    }
    if (!_id) {
      return res.status(400).json({ message: "معرّف الموظف ناقص" });
    }

    const employer = await Employers.findByIdAndDelete(_id);
    if (!employer) {
      return res.status(404).json({ message: "الموظف غير موجود" });
    }

    // فكّ تخصيص المواد التي كانت مسلّمة له
    await Exams.updateMany(
      { employer: String(_id) },
      { $set: { employer: null } },
    );

    res.status(200).json({ message: "تم حذف الموظف" });
  } catch (error) {
    console.error("خطأ في Delete_Employer:", error.message);
    res.status(500).json({ message: "تأكد من اتصالك بالانترنت" });
  }
};
