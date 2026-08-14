import Employer from "../models/employer.js";
import Exams from "../models/exam.js";
import dotenv from "dotenv";

dotenv.config();

// ─── من يملك أن يمسّ ماذا ─────────────────────────────────────────────────────
// بابان لا ثالث:
//   ① كلمة اللوحة (`PASSWORD`) — للوحة التحكم، تفتح كل شيء.
//   ② عضوٌ مسجَّل (`employer_id`) — ولا يبلغ إلا مادةً **استُلمت له**.
//
// الشرط الثاني يُفحَص **في الخادم** لا في الواجهة. لو اكتُفي بترشيح القائمة
// في تطبيق الأعضاء لكفى تعديلُ طلبٍ واحد ليبلغ عضوٌ مادةَ غيره — والترشيح
// في الواجهة راحةُ عرضٍ لا حراسة.

export const isPanel = (req) => {
  const p = req.body?.PASSWORD;
  return Boolean(p) && p === process.env.PASSWORD;
};

/** عضوٌ موجود فعلاً في القاعدة — لا مجرّد معرّفٍ مكتوب في الطلب */
export const employerOf = async (req) => {
  const id = req.body?.employer_id;
  if (!id) return null;
  try {
    const e = await Employer.findById(String(id)).select("_id name").lean();
    return e || null;
  } catch {
    // معرّفٌ غير صالح الشكل — ليس عضواً
    return null;
  }
};

/** هل المادة مُسلَّمة لهذا العضو؟ */
export const employerOwns = async (employerId, subjectId) => {
  if (!employerId || !subjectId) return false;
  try {
    return Boolean(
      await Exams.exists({
        _id: String(subjectId),
        employer: String(employerId),
      }),
    );
  } catch {
    return false;
  }
};

/**
 * بوّابة عملٍ على مادةٍ بعينها.
 * يردّ 401 ويعيد false إن لم يُسمح — فيكفي المستدعي `if (!(await allowSubject(...))) return;`
 */
export const allowSubject = async (req, res, subjectId) => {
  if (isPanel(req)) return true;

  const emp = await employerOf(req);
  if (emp && (await employerOwns(emp._id, subjectId))) return true;

  res.status(401).json({
    message: emp
      ? "هذه المادة غير مُسلَّمة لك"
      : "غير مصرّح",
  });
  return false;
};

/**
 * بوّابة أدواتٍ لا تخصّ مادةً بعينها (توليد، تدقيق، تفريغ، رفع صور).
 * تكفي فيها عضويةٌ صحيحة: الأداة لا تقرأ محتوى مادةٍ ولا تكتب فيها.
 */
export const allowTool = async (req, res) => {
  if (isPanel(req)) return true;
  if (await employerOf(req)) return true;
  res.status(401).json({ message: "غير مصرّح" });
  return false;
};
