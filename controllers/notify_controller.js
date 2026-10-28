import mongoose from "mongoose";
import Students from "../models/student.js";
import Subjects from "../models/exam.js";
import { callExamsBackend } from "../config/exams_backend.js";
import dotenv from "dotenv";
dotenv.config();

// ─── إشعارات يكتبها المشرف بيده ──────────────────────────────────────────────
// لطالبٍ بعينه، أو لكل مشتركي مادة دفعةً واحدة.
//
// الرموز تُقرأ من مجموعة `studentpushtokens` مباشرةً (القاعدة مشتركة مع باك
// اند الطلاب، والمالك الحقيقي لمخططها هناك: `models/StudentPushToken.js`).
// نقرؤها لنعرف مسبقاً من سيصله الإشعار فعلاً — فلا نعِد المشرف بمئة مستلم
// وثلثهم بلا تطبيق مثبَّت.
//
// الإرسال نفسه يمرّ من `/notify-student` في باك اند الطلاب كبقية إشعارات
// اللوحة: هناك يُفرَّق بين رمز Expo ورمز FCM، فلا نكرّر المنطق هنا.

const TOKENS = "studentpushtokens";
const TITLE_MAX = 120;
const BODY_MAX = 1000;
// إرسالٌ متوازٍ بحدّ: مادة بمئات المشتركين لا تُرسل واحداً واحداً (بطيء)
// ولا كلها معاً (نُغرق خادم الطلاب بمئات الطلبات في اللحظة نفسها).
const CONCURRENCY = 8;

const guard = (req, res) => {
  const { PASSWORD } = req.body || {};
  if (!PASSWORD || PASSWORD !== process.env.PASSWORD) {
    res.status(401).json({ message: "غير مصرّح" });
    return false;
  }
  return true;
};

// الأرقام الجامعية مخزّنة نصاً في available_to وأحياناً رقماً — نوحّدها نصاً
const uniqIds = (arr) => [
  ...new Set((arr || []).map((x) => String(x).trim()).filter(Boolean)),
];

/** أيّ هذه الأرقام الجامعية له رمز إشعار؟ */
const idsWithToken = async (ids) => {
  if (ids.length === 0) return new Set();
  const rows = await mongoose.connection.db
    .collection(TOKENS)
    .find(
      { _id_student: { $in: ids }, token: { $nin: [null, ""] } },
      { projection: { _id_student: 1 } },
    )
    .toArray();
  return new Set(rows.map((r) => String(r._id_student)));
};

/** أسماء الطلاب لعرض القائمة — Student.ID رقم في القاعدة */
const namesOf = async (ids) => {
  const nums = ids.map(Number).filter((n) => !Number.isNaN(n));
  const rows = await Students.find(
    { ID: { $in: nums } },
    { ID: 1, name: 1, _id: 0 },
  ).lean();
  return new Map(rows.map((r) => [String(r.ID), r.name]));
};

/**
 * جمهور مادة حسب النطاق:
 *   all    — كل المشتركين (available_to ∪ available_to_moadal)
 *   moadal — مشتركو «معدل» وحدهم
 *   tarfee — مشتركو «ترفيع» وحدهم (في available_to وليسوا في معدل)
 */
const subjectAudience = async (subject_id, scope = "all") => {
  if (!mongoose.isValidObjectId(subject_id)) return null;
  const subject = await Subjects.findById(subject_id, {
    name: 1,
    available_to: 1,
    available_to_moadal: 1,
  }).lean();
  if (!subject) return null;

  const tarfee = uniqIds(subject.available_to);
  const moadal = uniqIds(subject.available_to_moadal);
  const moadalSet = new Set(moadal);

  let ids;
  if (scope === "moadal") ids = moadal;
  else if (scope === "tarfee") ids = tarfee.filter((x) => !moadalSet.has(x));
  else ids = uniqIds([...tarfee, ...moadal]);

  return { subject, ids, moadalSet };
};

/**
 * حالة طالبٍ واحد قبل الإرسال: موجود؟ وله رمز؟
 * body: { PASSWORD, student_ID }
 */
export const Notify_Student_Status = async (req, res) => {
  try {
    if (!guard(req, res)) return;
    const student_ID = String(req.body.student_ID || "").trim();
    if (!student_ID) {
      return res.status(400).json({ message: "الرقم الجامعي مطلوب" });
    }
    const [names, tokens] = await Promise.all([
      namesOf([student_ID]),
      idsWithToken([student_ID]),
    ]);
    return res.status(200).json({
      student_ID,
      exists: names.has(student_ID),
      name: names.get(student_ID) || "",
      has_token: tokens.has(student_ID),
    });
  } catch (error) {
    console.error("Notify_Student_Status:", error.message);
    return res.status(500).json({ message: "تعذّر فحص الطالب" });
  }
};

/**
 * معاينة جمهور مادة: كم مشتركاً، ومن منهم سيصله الإشعار.
 * body: { PASSWORD, subject_id, scope }
 */
export const Notify_Subject_Audience = async (req, res) => {
  try {
    if (!guard(req, res)) return;
    const { subject_id, scope } = req.body;
    const aud = await subjectAudience(subject_id, scope);
    if (!aud) return res.status(404).json({ message: "المادة غير موجودة" });

    const [names, tokens] = await Promise.all([
      namesOf(aud.ids),
      idsWithToken(aud.ids),
    ]);
    const students = aud.ids.map((id) => ({
      ID: id,
      name: names.get(id) || "",
      tier: aud.moadalSet.has(id) ? "moadal" : "tarfee",
      has_token: tokens.has(id),
    }));

    return res.status(200).json({
      subject_name: aud.subject.name,
      total: students.length,
      with_token: students.filter((s) => s.has_token).length,
      students,
    });
  } catch (error) {
    console.error("Notify_Subject_Audience:", error.message);
    return res.status(500).json({ message: "تعذّر جلب مشتركي المادة" });
  }
};

/**
 * الإرسال. إما طالب واحد أو جمهور مادة.
 * body: { PASSWORD, title, body, student_ID }
 *    أو { PASSWORD, title, body, subject_id, scope }
 *
 * من لا رمز له يُستبعد قبل الإرسال ويُعدّ في `skipped` — لا فائدة من
 * طلبٍ نعرف سلفاً أنه لن يصل.
 */
export const Send_Notification = async (req, res) => {
  try {
    if (!guard(req, res)) return;
    const title = String(req.body.title || "").trim();
    const body = String(req.body.body || "").trim();
    if (!title || !body) {
      return res.status(400).json({ message: "العنوان والنص مطلوبان" });
    }
    if (title.length > TITLE_MAX || body.length > BODY_MAX) {
      return res.status(400).json({
        message: `الحدّ الأقصى ${TITLE_MAX} حرفاً للعنوان و${BODY_MAX} للنص`,
      });
    }

    let targets;
    if (req.body.student_ID) {
      targets = [String(req.body.student_ID).trim()];
    } else if (req.body.subject_id) {
      const aud = await subjectAudience(req.body.subject_id, req.body.scope);
      if (!aud) return res.status(404).json({ message: "المادة غير موجودة" });
      targets = aud.ids;
    } else {
      return res
        .status(400)
        .json({ message: "حدّد طالباً أو مادة لإرسال الإشعار" });
    }

    const tokens = await idsWithToken(targets);
    const recipients = targets.filter((id) => tokens.has(id));
    const skipped = targets.length - recipients.length;

    if (recipients.length === 0) {
      return res.status(400).json({
        message:
          targets.length === 1
            ? "هذا الطالب لا يملك رمز إشعار (لم يفتح التطبيق أو لم يسمح بالإشعارات)"
            : "لا أحد من المستهدفين يملك رمز إشعار",
        sent: 0,
        failed: 0,
        skipped,
      });
    }

    const failed_ids = [];
    let cursor = 0;
    const worker = async () => {
      while (cursor < recipients.length) {
        const student_ID = recipients[cursor++];
        const r = await callExamsBackend(
          "/notify-student",
          { student_ID, title, body },
          `إشعار يدوي للطالب ${student_ID}`,
        );
        if (!r.ok) failed_ids.push(student_ID);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, recipients.length) }, worker),
    );

    const sent = recipients.length - failed_ids.length;
    console.log(
      `📣 إشعار يدوي «${title}»: أُرسل ${sent}، فشل ${failed_ids.length}، بلا رمز ${skipped}`,
    );

    return res.status(200).json({
      message:
        failed_ids.length === 0
          ? `تم إرسال الإشعار إلى ${sent} ${sent === 1 ? "طالب" : "طالباً"}`
          : `أُرسل إلى ${sent} وتعذّر الإرسال إلى ${failed_ids.length}`,
      sent,
      failed: failed_ids.length,
      failed_ids,
      skipped,
    });
  } catch (error) {
    console.error("Send_Notification:", error.message);
    return res.status(500).json({ message: "تعذّر إرسال الإشعار" });
  }
};
