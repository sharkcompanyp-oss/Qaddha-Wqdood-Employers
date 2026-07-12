// طبقة المحاضرات — تُسند الشكوى إلى نص المحاضرة الحقيقي (من مجموعة lecture_texts
// في Mongo). لا ملفات محلية: الوكيل يعمل على Render فيقرأ من قاعدة البيانات.
// ترجمة أمينة لـ lectures.py: college→section، اختيار المادة (fast-path حرفي ثم
// النموذج)، فهرسة المحاضرات، اختيار المحاضرة دلالياً، قراءة نصها.

import LectureText from "../../models/lecture_text.js";
import { askText, extractJson } from "./provider.js";

export const ALL_SECTIONS = ["طب أسنان", "تجميل"];

// رمز الكلية (48/54) أو اسمها → مجلد القسم
const COLLEGE_TO_SECTION = {
  48: "طب أسنان",
  54: "تجميل",
  "48": "طب أسنان",
  "54": "تجميل",
  تجميل: "تجميل",
  "طب أسنان": "طب أسنان",
  "طب اسنان": "طب أسنان",
};

// تطبيع عربي: إزالة التشكيل/التطويل، توحيد الألف/الياء/التاء المربوطة، تبسيط.
export function norm(s) {
  if (!s) return "";
  return String(s)
    .replace(/[ً-ْٰـ]/g, "") // حركات + تطويل
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function sectionForCollege(college) {
  if (college === null || college === undefined || String(college).trim() === "")
    return null;
  const key = String(college).trim();
  if (COLLEGE_TO_SECTION[key]) return COLLEGE_TO_SECTION[key];
  const n = norm(key);
  for (const [k, v] of Object.entries(COLLEGE_TO_SECTION)) {
    const nk = norm(k);
    if (nk && (nk === n || nk.includes(n) || n.includes(nk))) return v;
  }
  return null;
}

export function sectionsToSearch(college) {
  const sec = sectionForCollege(college);
  return sec ? [sec] : [...ALL_SECTIONS];
}

// أسماء مجلدات المواد ضمن قسم (من المجموعة)
export async function listSubjectFolders(section) {
  const rows = await LectureText.distinct("subject", { section });
  return rows.sort((a, b) => a.localeCompare(b, "ar"));
}

// النموذج يختار مجلد المادة (fast-path: مطابقة حرفية دون استدعاء)
export async function pickSubjectFolder(subjectName, folders, ctx) {
  if (!folders.length) return null;
  const nSubj = norm(subjectName);
  for (const f of folders) if (norm(f) === nSubj) return f;

  const prompt =
    "أنت تساعد في إيجاد مجلد المادة الصحيح. اسم المادة في الشكوى قد لا يطابق اسم " +
    "المجلد حرفياً. اختر المجلد الأنسب من القائمة أو أعد null.\n\n" +
    `اسم المادة في الشكوى: ${subjectName}\n\nالمجلدات المتاحة:\n` +
    folders.map((n) => `- ${n}`).join("\n") +
    '\n\nأعد JSON فقط: {"folder": "الاسم أو null"}';
  try {
    const out = extractJson(await askText({ ...ctx, prompt }));
    const folder = out.folder;
    if (folders.includes(folder)) return folder;
    for (const n of folders)
      if (folder && (n === folder || n.trim() === String(folder).trim())) return n;
  } catch {
    /* تجاهل — نعيد null */
  }
  return null;
}

export async function findSubjectAcrossSections(subjectName, sections, ctx) {
  for (const section of sections) {
    const folders = await listSubjectFolders(section);
    if (!folders.length) continue;
    const folder = await pickSubjectFolder(subjectName, folders, ctx);
    if (folder) return { section, folder };
  }
  return { section: null, folder: null };
}

// فهرس محاضرات المادة: {id, file, preview, full} — نحتفظ بالنص الكامل أيضاً
// للبحث النصّي الإسنادي (fallback) إن لم يجزم النموذج.
export async function buildIndex(section, subject, headChars = 1200) {
  const rows = await LectureText.find({ section, subject }).lean();
  return rows.map((r) => {
    const cleaned = (r.text || "")
      .replace(/=====\s*(صفحة|شريحة)\s*\d+\s*=====/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return {
      id: String(r._id),
      file: r.file,
      preview: cleaned.slice(0, headChars),
      full: cleaned, // للبحث النصّي عند اللزوم
    };
  });
}

// كلمات مفتاحية مفيدة من نصٍّ (تتجاهل حروف الجر/العطف القصيرة)
function keyWords(s) {
  return norm(s)
    .split(" ")
    .map((w) => (w.startsWith("و") && w.length > 2 ? w.slice(1) : w))
    .map((w) => (w.startsWith("ال") && w.length > 3 ? w.slice(2) : w))
    .filter((w) => w.length >= 3);
}

// يختار الوكيل المحاضرة الأنسب. الذكاء أولاً (النموذج يبحث دلالياً باسم المحاضرة
// + نص الشكوى نفسها + مقتطفات أطول)، ثم خطة إسناد نصّية، ثم إن بقيت محاضرة
// واحدة فقط نأخذها. لا نستسلم لـ null بسهولة.
export async function pickLecture(lectureName, index, ctx, claim = "") {
  if (!index.length) return null;
  if (index.length === 1) return index[0].id; // مادة بمحاضرة واحدة → حسمها

  const listing = index
    .map((it, i) => `[${i}] الملف: ${it.file}\n    مقتطف: ${it.preview.slice(0, 500)}`)
    .join("\n\n");

  const prompt =
    "مهمتك: اختيار المحاضرة التي يتحدّث عنها الطالب في شكواه، من قائمة محاضرات المادة.\n" +
    "مهم: اسم المحاضرة في الشكوى قد لا يُذكر حرفياً في الملف أو مقتطفه — استدلّ بذكاء " +
    "من الموضوع العام لكل محاضرة (من المقتطف) ومن نص شكوى الطالب. اختر الأقرب موضوعياً.\n" +
    "اختر رقماً دائماً إن وُجد أي احتمال معقول؛ لا تُعد null إلا إذا كان الموضوع لا " +
    "يمتّ بصلة لأي محاضرة إطلاقاً.\n\n" +
    `اسم المحاضرة في الشكوى: ${lectureName || "(غير محدّد)"}\n` +
    `نص شكوى الطالب: ${claim || "(غير متوفر)"}\n\n` +
    `محاضرات المادة:\n${listing}\n\n` +
    'أعد JSON فقط: {"index": رقم المحاضرة الأنسب, "confidence": 0..1}';

  try {
    const out = extractJson(await askText({ ...ctx, prompt }));
    const i = out.index;
    if (Number.isInteger(i) && i >= 0 && i < index.length) return index[i].id;
  } catch {
    /* نتابع للخطة البديلة */
  }

  // خطة إسناد نصّية: طابِق كلمات (اسم المحاضرة + الشكوى) داخل النص الكامل لكل ملف.
  const terms = [...new Set([...keyWords(lectureName), ...keyWords(claim)])];
  if (terms.length) {
    let best = null,
      bestScore = 0;
    for (const it of index) {
      const hay = norm(it.full);
      let score = 0;
      for (const t of terms) if (hay.includes(t)) score += 1;
      if (score > bestScore) {
        bestScore = score;
        best = it;
      }
    }
    if (best && bestScore > 0) return best.id;
  }
  return null;
}

export async function readLecture(id, maxChars = 45000) {
  const row = await LectureText.findById(id).lean();
  if (!row) return "";
  const text = (row.text || "").replace(
    /=====\s*(صفحة|شريحة)\s*(\d+)\s*=====/g,
    "\n\n[$1 $2]\n",
  );
  return text.slice(0, maxChars);
}
