import mongoose from "mongoose";
import Exams from "../models/exam.js";
import Admins from "../models/admin.js"; // تأكد من الاسم الصحيح
import Employers from "../models/employer.js";
import { recomputeMoadalAvailability } from "../services/moadal_eligibility.js";
import { purgePlansForStudents } from "../services/purge_plans.js";
import dotenv from "dotenv";

dotenv.config();

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const Update_Exam = async (req, res) => {
  console.log("=== Update_Exam called ===");
  console.log("body keys:", Object.keys(req.body));
  try {
    const {
      _id,
      new_name,
      new_info,
      new_questions,
      new_available_to,
      new_price,
      new_price_moadal,
      new_summary,
      // ─── حقول لوحة «بيانات المادة» — كلٌّ اختياري، والغياب = لا تلمس ───
      new_college_id,
      new_visible,
      new_free, // عدد الاشتراكات المجانية في ترفيع
      new_free_moadal, // عدد الاشتراكات المجانية في معدل
      new_available_to_moadal,
      new_employer, // _id العضو، أو null/"" لإلغاء التسليم
      // ─── حقول مسار العضو ───
      employee, // true إذا كان الحفظ صادراً من تطبيق العضو
      employer_id, // _id العضو
      elapsed_seconds, // الوقت المنقضي من بدء التعديل إلى الحفظ
      PASSWORD,
    } = req.body;

    // مسار الأدمن كان بلا حارس إطلاقاً: من يعرف الرابط يعدّل أي مادة.
    // مسار العضو يتحقّق بملكيته للمادة أدناه، فيُستثنى من كلمة السرّ.
    if (employee !== true) {
      if (!PASSWORD || PASSWORD !== process.env.PASSWORD) {
        return res.status(401).json({ message: "غير مصرّح" });
      }
    }

    if (!_id) {
      return res.status(400).json({ message: "رمز المادة ناقص" });
    }
    const The_Exam = await Exams.findOne({
      _id: _id,
    });
    if (!The_Exam) {
      return res.status(404).json({ message: "المادة غير موجود" });
    }

    // ─── مسار العضو: تعديل الأسئلة فقط مع تسجيل الجلسة ──────────────────────────
    if (employee === true) {
      // تحقّق من أن هذه المادة مخصّصة لهذا العضو
      if (
        !employer_id ||
        !The_Exam.employer ||
        String(The_Exam.employer) !== String(employer_id)
      ) {
        return res.status(403).json({ message: "تعذر التعديل" });
      }

      // أبقِ كل معلومات المادة كما هي، وغيّر الأسئلة فقط
      The_Exam.questions = new_questions;
      // تغيّرت الأسئلة → قد تنكسر أهلية معدل (أو تكتمل)
      const eligibility = recomputeMoadalAvailability(The_Exam);
      if (eligibility.changed) {
        console.log(
          `[معدل] ${The_Exam.name}: الأهلية ${eligibility.was} → ${eligibility.now} (تعديل عضو)`,
        );
      }
      await The_Exam.save();

      // أضف معلومات الجلسة لسجل العضو
      const employer = await Employers.findById(employer_id);
      if (employer) {
        employer.sessions.push({
          subject_id: String(The_Exam._id),
          subject_name: The_Exam.name,
          edited_at: new Date(),
          elapsed_seconds: Number(elapsed_seconds) || 0,
        });
        await employer.save();
      }

      return res.status(200).json({ message: "تم حفظ تعديلات الأسئلة" });
    }

    // ─── فحص الحقول الاختيارية قبل أي كتابة ─────────────────────────────────
    // كل الرفض هنا، قبل أن يُمسّ الأدمن أو المادة: قيمةٌ فاسدة في حقلٍ
    // واحد لا يجوز أن تمرّ نصفَ حفظ.
    const bad = (message) => res.status(400).json({ message });

    let next_college;
    if (new_college_id !== undefined) {
      next_college = Number(new_college_id);
      if (!Number.isInteger(next_college) || next_college <= 0) {
        return bad("رمز الكلية غير صالح");
      }
    }
    if (new_visible !== undefined && typeof new_visible !== "boolean") {
      return bad("قيمة الظهور غير صالحة");
    }
    const asCount = (v) => {
      const n = Number(v);
      return Number.isInteger(n) && n >= 0 ? n : null;
    };
    if (new_free !== undefined && asCount(new_free) === null) {
      return bad("عدد الاشتراكات المجانية (ترفيع) غير صالح");
    }
    if (new_free_moadal !== undefined && asCount(new_free_moadal) === null) {
      return bad("عدد الاشتراكات المجانية (معدل) غير صالح");
    }
    if (
      new_available_to_moadal !== undefined &&
      !Array.isArray(new_available_to_moadal)
    ) {
      return bad("قائمة مشتركي معدل غير صالحة");
    }
    let next_employer; // undefined = لا تلمس، null = إلغاء التسليم
    if (new_employer !== undefined) {
      if (new_employer === null || new_employer === "") {
        next_employer = null;
      } else {
        if (!mongoose.isValidObjectId(new_employer)) {
          return bad("معرّف العضو غير صالح");
        }
        if (!(await Employers.exists({ _id: new_employer }))) {
          return res.status(404).json({ message: "العضو غير موجود" });
        }
        next_employer = String(new_employer);
      }
    }

    // حقل المشتركين وحده كان يفلت من حارس «الغياب ≠ الحذف»: القيمة تُطبَّع
    // إلى [] قبل الفحص، فتصبح `[] !== undefined` صحيحة دائماً ويُسند المصفوفة
    // الفارغة فوق المشتركين. حمولةٌ لا تذكر المشتركين كانت تمحوهم جميعاً.
    const has_available = new_available_to !== undefined;

    const clean_new_available_to = Array.isArray(new_available_to)
      ? new_available_to.filter(
          (x) => x !== null && x !== undefined && x !== "",
        )
      : [];

    const clean_old_available_to = (Array.isArray(The_Exam.available_to) ? The_Exam.available_to : []).filter(
      (x) => x !== null && x !== undefined && x !== "",
    );

    // حساب عدد الطلاب قبل وبعد
    const old_count = clean_old_available_to.length;
    const new_count = has_available ? clean_new_available_to.length : old_count;

    // حساب الفرق — صفر حين لا تُذكر القائمة أصلاً
    const difference = has_available ? new_count - old_count : 0;

    let profit_to_add = 0;
    if (difference > 0) {
      // السعر قد يغيب عن الحمولة — NaN هنا كان سيُفسد رصيد الأدمن
      profit_to_add = difference * (Number(new_price ?? The_Exam.price) || 0);
    }

    // الحصول على الأدمن
    const admin = await Admins.findById(The_Exam.admin_id);
    if (!admin) {
      return res.status(404).json({ message: "الأدمن غير موجود" });
    }

    // إضافة الربح
    admin.total_profit += profit_to_add;
    await admin.save();

    // تحديث بيانات المادة.
    // الإسناد مشروط بالوصول: حمولة ناقصة (لأي سبب — جلب تدريجي، انقطاع،
    // عميل قديم) كانت تكتب undefined فوق حقول سليمة، فتمحو الأسئلة
    // والمشتركين بلا إنذار. الغياب يعني «لا تلمس» لا «احذف».
    const setIf = (key, value) => {
      if (value !== undefined) The_Exam[key] = value;
    };
    setIf("name", new_name);
    setIf("info", new_info);
    setIf("questions", new_questions);

    // ── إلغاء تسجيل طالب: تنظيف كامل لا حذفٌ من قائمة واحدة ──────────────
    // من خرج من `available_to` يجب أن يخرج من `available_to_moadal` أيضاً
    // (معدل تشمل ترفيع، فبقاؤه فيها يُبقي له نص المقرر والخطة والتحريري
    // بعد أن رُفع اسمه من المادة)، وتُحذف خطته لهذه المادة نهائياً.
    let removed_students = [];
    if (has_available) {
      const kept = new Set(clean_new_available_to.map(String));
      removed_students = clean_old_available_to
        .map(String)
        .filter((id) => !kept.has(id));

      The_Exam.available_to = clean_new_available_to;

      if (removed_students.length > 0) {
        const removedSet = new Set(removed_students);
        The_Exam.available_to_moadal = (
          Array.isArray(The_Exam.available_to_moadal)
            ? The_Exam.available_to_moadal
            : []
        ).filter((id) => !removedSet.has(String(id)));
      }
    }
    // ── قائمة «معدل» ──────────────────────────────────────────────────────
    // معدل تشمل ترفيع: من في معدل يجب أن يكون في available_to أيضاً، فيُضاف
    // إليها إن لم يكن. ومن أُخرج من ترفيع في الحفظ نفسه يبقى خارج معدل —
    // الإخراج الصريح يغلب.
    let moadal_added_to_tarfee = 0;
    if (new_available_to_moadal !== undefined) {
      const removedSet = new Set(removed_students);
      const next_moadal = [
        ...new Set(
          new_available_to_moadal
            .filter((x) => x !== null && x !== undefined)
            .map((x) => String(x).trim())
            .filter(Boolean),
        ),
      ].filter((id) => !removedSet.has(id));
      The_Exam.available_to_moadal = next_moadal;

      const tarfee = new Set(
        (Array.isArray(The_Exam.available_to) ? The_Exam.available_to : []).map(
          String,
        ),
      );
      const missing = next_moadal.filter((id) => !tarfee.has(id));
      if (missing.length > 0) {
        The_Exam.available_to = [
          ...(Array.isArray(The_Exam.available_to) ? The_Exam.available_to : []),
          ...missing,
        ];
        moadal_added_to_tarfee = missing.length;
      }
    }

    setIf("price", new_price);
    if (new_price_moadal !== undefined) {
      The_Exam.price_moadal = Number(new_price_moadal) || 0;
    }
    if (next_college !== undefined) The_Exam.college_id = next_college;
    if (new_visible !== undefined) The_Exam.visible = new_visible;
    if (new_free !== undefined) {
      The_Exam.number_of_free_subscriptions = asCount(new_free);
    }
    if (new_free_moadal !== undefined) {
      The_Exam.number_of_free_moadal_subscriptions = asCount(new_free_moadal);
    }
    if (next_employer !== undefined) The_Exam.employer = next_employer;
    // قبل The_Exam.save()
    console.log("new_summary received:", JSON.stringify(new_summary, null, 2));
    console.log("summary length:", new_summary?.length);
    if (Array.isArray(new_summary) && new_summary.length > 0) {
      The_Exam.summary = new_summary;
    }

    // إعادة حساب أهلية «معدل» بعد أي تعديل على الأسئلة أو الملخص —
    // وإلا بقيت المادة معلَّمة مؤهلة زوراً بعد حذف محتوى تعتمد عليه.
    const eligibility = recomputeMoadalAvailability(The_Exam);
    if (eligibility.changed) {
      console.log(
        `[معدل] ${The_Exam.name}: الأهلية ${eligibility.was} → ${eligibility.now}`,
      );
    }

    await The_Exam.save();

    // بعد نجاح الحفظ فقط: خطة من لم يعد مسجَّلاً تُحذف نهائياً هي ومهامها.
    // (قبل الحفظ كنا سنحذف خططاً لتعديل قد يفشل.)
    let purged = { plans: 0, tasks: 0 };
    if (removed_students.length > 0) {
      try {
        purged = await purgePlansForStudents(
          String(The_Exam._id),
          removed_students,
        );
      } catch (purgeErr) {
        // فشل التنظيف لا يُلغي التعديل — لكنه يُعلَن ليُعالَج
        console.error("فشل حذف خطط الطلاب المحذوفين:", purgeErr);
      }
    }

    res.status(200).json({
      message: "تم تحديث بيانات المادة",
      profit_added: profit_to_add,
      old_count,
      new_count,
      removed_students: removed_students.length,
      purged_plans: purged.plans,
      moadal_added_to_tarfee,
    });
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ message: "تحقق من اتصالك بالانترنت", error: error.message });
  }
};
