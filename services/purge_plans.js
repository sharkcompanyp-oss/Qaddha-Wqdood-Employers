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

// حدّ الإنجاز الذي يُبنى عليه قرار الضمان
const DONE_THRESHOLD = 90;

/** الحقول التي تختم الأرشفة */
const archiveSet = (reason) => ({
  status: "archived",
  archived_at: new Date(),
  archived_reason: reason,
});

/**
 * يحسب لقطة إنجاز كل خطة من مهامّها ويجمّدها.
 * تُحسب مرّةً واحدة لأن إعادة حسابها لاحقاً قد تعطي رقماً مختلفاً لو
 * تغيّرت المادة — والسجلّ يجب أن يبقى شاهداً على ما جرى وقتها.
 */
const computeCompletions = async (planIds) => {
  const tasks = await StudyTask.find({ plan_id: { $in: planIds } })
    .select("plan_id status type")
    .lean();

  const byPlan = new Map(planIds.map((id) => [String(id), []]));
  tasks.forEach((t) => {
    const arr = byPlan.get(String(t.plan_id));
    if (arr) arr.push(t);
  });

  const out = new Map();
  for (const [planId, list] of byPlan) {
    const total = list.length;
    const done = list.filter((t) => t.status === "done").length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    // ما لم يُنجَز، مصنَّفاً بنوعه — مادةُ التحليل لاحقاً
    const pendingByType = {};
    list
      .filter((t) => t.status !== "done")
      .forEach((t) => {
        const k = t.type || "unknown";
        pendingByType[k] = (pendingByType[k] || 0) + 1;
      });

    out.set(planId, {
      label: pct >= DONE_THRESHOLD ? "منجز" : "غير منجز",
      pct,
      tasks_total: total,
      tasks_done: done,
      pending_by_type: pendingByType,
      computed_at: new Date(),
    });
  }
  return out;
};


/**
 * جوهر الأرشفة — تستعمله الدوال الثلاث. توحيده يمنع أن تُصلَح ثغرة في
 * إحداها وتبقى في أختيها.
 */
const archivePlans = async (filter, reason, label) => {
  const scoped = { ...filter, status: { $ne: "archived" } };
  const plans = await StudyPlan.find(scoped).select("_id").lean();
  if (plans.length === 0) return { plans: 0, tasks: 0 };

  const planIds = plans.map((p) => String(p._id));

  // ① لقطة الإنجاز **قبل** تجميد المهام: بعد تحويلها إلى archived تختلط
  //    غير المنجَزة بالمنجَزة فلا يعود الحساب صادقاً.
  const completions = await computeCompletions(planIds);

  // ② تجميد المهام المعلّقة — تبقى بتفاصيلها ولا تُطالِب الطالب
  const tasks = await StudyTask.updateMany(
    { plan_id: { $in: planIds }, status: "pending" },
    { $set: { status: "archived" } },
  );

  // ③ ختم كل خطة بحالتها ولقطتها. bulkWrite لأن لكل خطة لقطتها الخاصة.
  const res = await StudyPlan.bulkWrite(
    plans.map((p) => ({
      updateOne: {
        filter: { _id: p._id },
        update: {
          $set: {
            ...archiveSet(reason),
            completion: completions.get(String(p._id)),
          },
        },
      },
    })),
  );

  const doneCount = [...completions.values()].filter(
    (c) => c.label === "منجز",
  ).length;
  console.log(
    `[خطط] ${label}: أُرشفت ${res.modifiedCount} خطة (${doneCount} منجزة) ` +
      `و${tasks.modifiedCount} مهمة`,
  );
  return { plans: res.modifiedCount, tasks: tasks.modifiedCount };
};

/** يؤرشف خطط طلاب بعينهم في مادة واحدة. */
export const purgePlansForStudents = async (
  subject_id,
  student_IDs,
  reason = "انتهاء الاشتراك",
) => {
  const ids = [...new Set((student_IDs || []).map(String).filter(Boolean))];
  if (!subject_id || ids.length === 0) return { plans: 0, tasks: 0 };
  return archivePlans(
    { subject_id: String(subject_id), student_ID: { $in: ids } },
    reason,
    `المادة ${subject_id} (طلاب: ${ids.join("، ")})`,
  );
};

/** يؤرشف كل خطط مادة (عند تصفية كل المشتركين منها). */
export const purgeAllPlansOfSubject = async (
  subject_id,
  reason = "تصفير المادة",
) => {
  if (!subject_id) return { plans: 0, tasks: 0 };
  return archivePlans(
    { subject_id: String(subject_id) },
    reason,
    `المادة ${subject_id}`,
  );
};

/** يؤرشف كل خطط طالب في كل المواد (عند حذف الطالب نفسه). */
export const purgeAllPlansOfStudent = async (
  student_ID,
  reason = "حذف الطالب",
) => {
  if (!student_ID) return { plans: 0, tasks: 0 };
  return archivePlans(
    { student_ID: String(student_ID) },
    reason,
    `الطالب ${student_ID}`,
  );
};
