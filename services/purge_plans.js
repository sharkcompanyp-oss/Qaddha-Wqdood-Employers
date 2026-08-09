import StudyPlan from "../models/study_plan.js";
import StudyTask from "../models/study_task.js";

// ─── حذف خطط الطلاب الذين لم يعودوا مسجَّلين ─────────────────────────────────
// قاعدة: لا خطة لمن ليس مشتركاً. إبقاء الخطة بعد إلغاء التسجيل يترك مهاماً
// تشير لمحتوى لم يعد الطالب يملكه، ويُبقي عدّاد الضمان يعمل لمن لا ضمان له،
// ويعيد الخطة القديمة لو أُعيد تسجيله لاحقاً بمقرر مختلف.
//
// الحذف نهائي وبالترتيب: المهام أولاً ثم الخطة، حتى لا تبقى مهام يتيمة
// بلا خطة لو انقطع التنفيذ في المنتصف.

/**
 * يحذف خطط طلاب بعينهم في مادة واحدة.
 * @param {string} subject_id
 * @param {Array<string|number>} student_IDs
 * @returns {Promise<{plans:number, tasks:number}>}
 */
export const purgePlansForStudents = async (subject_id, student_IDs) => {
  const ids = [...new Set((student_IDs || []).map(String).filter(Boolean))];
  if (!subject_id || ids.length === 0) return { plans: 0, tasks: 0 };

  const filter = { subject_id: String(subject_id), student_ID: { $in: ids } };
  const plans = await StudyPlan.find(filter).select("_id").lean();
  if (plans.length === 0) return { plans: 0, tasks: 0 };

  const planIds = plans.map((p) => String(p._id));
  const tasks = await StudyTask.deleteMany({ plan_id: { $in: planIds } });
  const removed = await StudyPlan.deleteMany({ _id: { $in: plans.map((p) => p._id) } });

  console.log(
    `[خطط] حُذفت ${removed.deletedCount} خطة و${tasks.deletedCount} مهمة ` +
      `للمادة ${subject_id} (طلاب: ${ids.join("، ")})`,
  );
  return { plans: removed.deletedCount, tasks: tasks.deletedCount };
};

/** يحذف كل خطط مادة (عند تصفية كل المشتركين منها). */
export const purgeAllPlansOfSubject = async (subject_id) => {
  if (!subject_id) return { plans: 0, tasks: 0 };
  const plans = await StudyPlan.find({ subject_id: String(subject_id) })
    .select("_id")
    .lean();
  if (plans.length === 0) return { plans: 0, tasks: 0 };

  const planIds = plans.map((p) => String(p._id));
  const tasks = await StudyTask.deleteMany({ plan_id: { $in: planIds } });
  const removed = await StudyPlan.deleteMany({
    _id: { $in: plans.map((p) => p._id) },
  });

  console.log(
    `[خطط] تصفية المادة ${subject_id}: حُذفت ${removed.deletedCount} خطة و${tasks.deletedCount} مهمة`,
  );
  return { plans: removed.deletedCount, tasks: tasks.deletedCount };
};

/** يحذف كل خطط طالب في كل المواد (عند حذف الطالب نفسه). */
export const purgeAllPlansOfStudent = async (student_ID) => {
  if (!student_ID) return { plans: 0, tasks: 0 };
  const plans = await StudyPlan.find({ student_ID: String(student_ID) })
    .select("_id")
    .lean();
  if (plans.length === 0) return { plans: 0, tasks: 0 };

  const planIds = plans.map((p) => String(p._id));
  const tasks = await StudyTask.deleteMany({ plan_id: { $in: planIds } });
  const removed = await StudyPlan.deleteMany({
    _id: { $in: plans.map((p) => p._id) },
  });

  console.log(
    `[خطط] حذف الطالب ${student_ID}: حُذفت ${removed.deletedCount} خطة و${tasks.deletedCount} مهمة`,
  );
  return { plans: removed.deletedCount, tasks: tasks.deletedCount };
};
