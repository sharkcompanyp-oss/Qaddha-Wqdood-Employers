// تشخيص للقراءة فقط — لا يكتب شيئاً.
// السؤال: أين تضيع أسماء المحاضرات ونصّ المقرَّر بين القاعدة والشاشة؟
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

await mongoose.connect(process.env.MONGO_URI);
const Subjects = mongoose.connection.collection("subjects");

// ① الشكل الخام كما هو مخزَّن فعلاً
const s = await Subjects.findOne(
  { "lectures.0": { $exists: true } },
  { projection: { name: 1, lectures: { $slice: 1 }, moadal_available: 1 } },
);
const l = (s.lectures || [])[0] || {};
console.log("مادة:", s.name, "| معدل:", !!s.moadal_available);
console.log("حقول المحاضرة:", Object.keys(l).join(", "));
console.log("name  =", JSON.stringify(l.name));
console.log("title =", JSON.stringify(l.title));
console.log("lecture_id =", JSON.stringify(l.lecture_id));
console.log("curriculum:", l.curriculum ? Object.keys(l.curriculum).join(",") : "غائب");
console.log("طول نص المقرَّر:", String(l.curriculum?.text || "").length);

// ② إحصاء شامل: كم محاضرة لها نصّ مقرَّر فعلاً؟
const agg = await Subjects.aggregate([
  { $unwind: "$lectures" },
  {
    $group: {
      _id: null,
      total: { $sum: 1 },
      withName: {
        $sum: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ["$lectures.name", ""] } }, 0] }, 1, 0] },
      },
      withCurr: {
        $sum: {
          $cond: [
            { $gt: [{ $strLenCP: { $ifNull: ["$lectures.curriculum.text", ""] } }, 0] },
            1,
            0,
          ],
        },
      },
      withSummary: {
        $sum: { $cond: [{ $gt: [{ $size: { $ifNull: ["$lectures.summary.sections", []] } }, 0] }, 1, 0] },
      },
      withQ: {
        $sum: { $cond: [{ $gt: [{ $size: { $ifNull: ["$lectures.questions", []] } }, 0] }, 1, 0] },
      },
      withFlash: {
        $sum: { $cond: [{ $gt: [{ $size: { $ifNull: ["$lectures.flash_cards", []] } }, 0] }, 1, 0] },
      },
      withWritten: {
        $sum: {
          $cond: [{ $gt: [{ $size: { $ifNull: ["$lectures.written_exam.questions", []] } }, 0] }, 1, 0],
        },
      },
    },
  },
]).toArray();
console.log("\n=== إحصاء 583 محاضرة ===");
console.log(agg[0]);

// ③ مادة «إطباق» تحديداً — التي جرّبتها
const it = await Subjects.findOne(
  { name: /إطباق/ },
  { projection: { name: 1, lectures: 1, moadal_available: 1, available_to_moadal: 1 } },
);
if (it) {
  console.log("\n=== %s ===", it.name);
  console.log("معدل متاح:", !!it.moadal_available, "| مشتركو معدل:", (it.available_to_moadal || []).length);
  (it.lectures || []).slice(0, 6).forEach((x, i) => {
    console.log(
      `  ${i + 1}. name=${JSON.stringify(x.name)} curr=${String(x.curriculum?.text || "").length} sum=${(x.summary?.sections || []).length} q=${(x.questions || []).length} flash=${(x.flash_cards || []).length} wr=${(x.written_exam?.questions || []).length}`,
    );
  });
}

await mongoose.disconnect();
