import StudyPlan from "../models/study_plan.js";
import StudyTask from "../models/study_task.js";

// ─── أرشفة خطط الطلاب الذين لم يعودوا مسجَّلين ───────────────────────────────
// كانت هذه الوحدة تحذف الخطط والمهام نهائياً. صارت تؤرشفها:
// الخطة تُختَم بحالة "archived" وتبقى بكامل تفاصيلها في بيانات الطالب،
// فتُرى في لوحة التحكم بعد انتهاء الاشتراك — سجلّ ما درسه الطالب فعلاً
// لا يُمحى بانتهاء اشتراكه، وهو أثرٌ يفيد في المتابعة والدعم والإحصاء.
//
// الأثر العملي للأرشفة (وهو ما كان الحذف يحقّقه):
//   • الخطة المؤرشفة لا تُعاد للطالب ولا تُحسب في «خطتي النشطة»
//   • مهامّها تتوقف: لا إشعارات ولا عدّاد ضمان ولا مطالبات
//   • إعادة التسجيل تُنشئ خطةً جديدة ولا تُحيي القديمة
// يتحقّق ذلك بشرط status في كل قارئ، لا بإفناء البيانات.

/** الحقول التي تختم الأرشفة */
const archiveSet = (reason) => ({
  status: "archived",
  archived_at: new Date(),
  archived_reason: reason,
});

/**
 * يؤرشف خطط طلاب بعينهم في مادة واحدة.
 * @returns {Promise<{plans:number, tasks:number}>}
 */
export const purgePlansForStudents = async (
  subject_id,
  student_IDs,
  reason = "انتهاء الاشتراك",
) => {
  const ids = [...new Set((student_IDs || []).map(String).filter(Boolean))];
  if (!subject_id || ids.length === 0) return { plans: 0, tasks: 0 };

  const filter = {
    subject_id: String(subject_id),
    student_ID: { $in: ids },
    status: { $ne: "archived" },
  };
  const plans = await StudyPlan.find(filter).select("_id").lean();
  if (plans.length === 0) return { plans: 0, tasks: 0 };

  const planIds = plans.map((p) => String(p._id));
  // المهام تبقى كما هي — هي تفصيل الخطة الذي أردتَ رؤيته. نجمّدها فقط
  // بحيث لا تظهر كـ«معلّقة» في أي حساب.
  const tasks = await StudyTask.updateMany(
    { plan_id: { $in: planIds }, status: "pending" },
    { $set: { status: "archived" } },
  );
  const archived = await StudyPlan.updateMany(filter, { $set: archiveSet(reason) });

  console.log(
    `[خطط] أُرشفت ${archived.modifiedCount} خطة و${tasks.modifiedCount} مهمة ` +
      `للمادة ${subject_id} (طلاب: ${ids.join("، ")})`,
  );
  return { plans: archived.modifiedCount, tasks: tasks.modifiedCount };
};

/** يؤرشف كل خطط مادة (عند تصفية كل المشتركين منها). */
export const purgeAllPlansOfSubject = async (
  subject_id,
  reason = "تصفير المادة",
) => {
  if (!subject_id) return { plans: 0, tasks: 0 };
  const filter = { subject_id: String(subject_id), status: { $ne: "archived" } };
  const plans = await StudyPlan.find(filter).select("_id").lean();
  if (plans.length === 0) return { plans: 0, tasks: 0 };

  const planIds = plans.map((p) => String(p._id));
  const tasks = await StudyTask.updateMany(
    { plan_id: { $in: planIds }, status: "pending" },
    { $set: { status: "archived" } },
  );
  const archived = await StudyPlan.updateMany(filter, { $set: archiveSet(reason) });

  console.log(
    `[خطط] المادة ${subject_id}: أُرشفت ${archived.modifiedCount} خطة و${tasks.modifiedCount} مهمة`,
  );
  return { plans: archived.modifiedCount, tasks: tasks.modifiedCount };
};

/** يؤرشف كل خطط طالب في كل المواد (عند حذف الطالب نفسه). */
export const purgeAllPlansOfStudent = async (
  student_ID,
  reason = "حذف الطالب",
) => {
  if (!student_ID) return { plans: 0, tasks: 0 };
  const filter = { student_ID: String(student_ID), status: { $ne: "archived" } };
  const plans = await StudyPlan.find(filter).select("_id").lean();
  if (plans.length === 0) return { plans: 0, tasks: 0 };

  const planIds = plans.map((p) => String(p._id));
  const tasks = await StudyTask.updateMany(
    { plan_id: { $in: planIds }, status: "pending" },
    { $set: { status: "archived" } },
  );
  const archived = await StudyPlan.updateMany(filter, { $set: archiveSet(reason) });

  console.log(
    `[خطط] الطالب ${student_ID}: أُرشفت ${archived.modifiedCount} خطة و${tasks.modifiedCount} مهمة`,
  );
  return { plans: archived.modifiedCount, tasks: tasks.modifiedCount };
};
