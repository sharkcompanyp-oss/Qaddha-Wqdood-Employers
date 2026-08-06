// تدقيق أهلية «معدل» لكل المواد: يكشف المواد المعلَّمة مؤهلة زوراً
// (بعد أن كُسر محتواها من محرر المادة) ويصلحها.
//
// للفحص فقط:      node audit_moadal.mjs
// للفحص والإصلاح: node audit_moadal.mjs --fix
import { readFileSync } from "fs";
import mongoose from "mongoose";
import { buildCompletenessReport, isEligibleFromReport } from "./services/moadal_eligibility.js";

const FIX = process.argv.includes("--fix");

const env = readFileSync("./.env", "utf8");
const uri = env
  .split(/\r?\n/)
  .find((l) => l.startsWith("MONGO_URI"))
  .split("=")
  .slice(1)
  .join("=")
  .trim();

await mongoose.connect(uri);
const col = mongoose.connection.db.collection("subjects");

const exams = await col.find({}).toArray();
console.log(`\n=== فحص ${exams.length} مادة ===\n`);

let mismatches = 0;
let fixed = 0;

for (const exam of exams) {
  const lectures = exam.lectures || [];
  if (lectures.length === 0) continue; // مادة غير منمذجة بعد

  const report = buildCompletenessReport(exam);
  const shouldBe = isEligibleFromReport(report);
  const flagged = exam.moadal_available === true;

  if (shouldBe === flagged) {
    console.log(`✓ ${exam.name}: ${flagged ? "مؤهلة" : "غير مؤهلة"} (صحيح)`);
    continue;
  }

  mismatches++;
  console.log(
    `\n⚠  ${exam.name}: معلَّمة "${flagged ? "مؤهلة" : "غير مؤهلة"}" والصحيح "${
      shouldBe ? "مؤهلة" : "غير مؤهلة"
    }"`,
  );

  // اعرض المحاضرات الناقصة تحديداً
  report
    .filter(
      (c) =>
        !(c.has_text && c.has_summary && c.has_questions && c.has_flash && c.has_written),
    )
    .slice(0, 10)
    .forEach((c) => {
      const missing = [
        !c.has_text && "نص",
        !c.has_summary && "ملخص",
        !c.has_questions && "أسئلة",
        !c.has_flash && "فلاش",
        !c.has_written && "تحريري",
      ].filter(Boolean);
      console.log(`     • ${c.title}: ينقصها ${missing.join("، ")}`);
    });

  if (FIX) {
    await col.updateOne(
      { _id: exam._id },
      { $set: { moadal_available: shouldBe } },
    );
    fixed++;
    console.log(`     ← صُحّحت إلى ${shouldBe}`);
  }

  // تحذير حرج: طلاب دفعوا معدل لمادة صارت غير مؤهلة
  if (flagged && !shouldBe && (exam.available_to_moadal || []).length > 0) {
    console.log(
      `     ‼ تنبيه: ${exam.available_to_moadal.length} طالب مشترك بمعدل في هذه المادة`,
    );
  }
}

console.log(
  `\n=== النتيجة: ${mismatches} مادة غير متطابقة${FIX ? ` — صُحّح ${fixed}` : " (شغّل --fix للإصلاح)"} ===`,
);

await mongoose.disconnect();
