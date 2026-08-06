import Exams from "../models/exam.js";
import LectureText from "../models/lecture_text.js";
import { recomputeMoadalAvailability } from "../services/moadal_eligibility.js";

// ─── أدوات مساعدة ─────────────────────────────────────────────────────────────

// عدّ الكلمات بعد إزالة رموز الماركداون الشائعة — أساس تقدير أزمنة الخطة
const countWords = (text) => {
  if (!text || typeof text !== "string") return 0;
  const stripped = text
    .replace(/[#*_`>\[\]()|\-]+/g, " ")
    .replace(/!\[.*?\]/g, " ")
    .replace(/https?:\/\/\S+/g, " ");
  const words = stripped.split(/\s+/).filter((w) => w.trim().length > 0);
  return words.length;
};

// جمع كل النصوص القابلة للقراءة من ملخص محاضرة (تجوال تعاودي كامل)
const collectSummaryText = (node) => {
  if (!node) return "";
  if (typeof node === "string") return " " + node;
  if (Array.isArray(node)) return node.map(collectSummaryText).join(" ");
  if (typeof node === "object") {
    let out = "";
    for (const key of ["text", "title", "description", "strong", "label"]) {
      if (typeof node[key] === "string") out += " " + node[key];
    }
    if (Array.isArray(node.items)) out += collectSummaryText(node.items);
    if (Array.isArray(node.content_blocks))
      out += collectSummaryText(node.content_blocks);
    if (Array.isArray(node.sections)) out += collectSummaryText(node.sections);
    return out;
  }
  return "";
};

// ─── قائمة نصوص المحاضرات (بلا النص الكامل — للربط في الواجهة) ────────────────

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const List_Lecture_Texts = async (req, res) => {
  try {
    const { PASSWORD, search } = req.body;
    if (!PASSWORD || PASSWORD !== process.env.PASSWORD) {
      return res.status(401).json({ message: "غير مصرح" });
    }

    const filter = {};
    if (search && String(search).trim()) {
      const rx = new RegExp(
        String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i",
      );
      filter.$or = [{ subject: rx }, { file: rx }, { section: rx }];
    }

    const texts = await LectureText.find(filter)
      .select("rel_path section subject file chars updated_at")
      .sort({ section: 1, subject: 1, file: 1 })
      .lean();

    res.status(200).json(texts);
  } catch (error) {
    console.error("List_Lecture_Texts:", error);
    res.status(500).json({ message: "تعذر جلب نصوص المحاضرات" });
  }
};

// ─── جلب نص محاضرة واحدة (للمعاينة في الواجهة) ────────────────────────────────

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const Get_Lecture_Text = async (req, res) => {
  try {
    const { PASSWORD, rel_path } = req.body;
    if (!PASSWORD || PASSWORD !== process.env.PASSWORD) {
      return res.status(401).json({ message: "غير مصرح" });
    }
    if (!rel_path) {
      return res.status(400).json({ message: "rel_path ناقص" });
    }
    const doc = await LectureText.findOne({ rel_path }).lean();
    if (!doc) {
      return res.status(404).json({ message: "النص غير موجود" });
    }
    res.status(200).json({
      rel_path: doc.rel_path,
      file: doc.file,
      chars: doc.chars,
      word_count: countWords(doc.text),
      text: doc.text,
    });
  } catch (error) {
    console.error("Get_Lecture_Text:", error);
    res.status(500).json({ message: "تعذر جلب النص" });
  }
};

// ─── حفظ محاضرات المادة (الاستبدال الكامل + الربط + الاشتقاق) ─────────────────

/**
 * يستقبل مصفوفة المحاضرات كاملة ويستبدل بها الموجود، ثم:
 * 1. يكتب lecture_id داخل summary[].meta و questions[] حسب الروابط.
 * 2. يحسب عدد كلمات النص والملخص لكل محاضرة (أساس أزمنة الخطة).
 * 3. يشتق moadal_available آلياً (كل المحاضرات مكتملة الأنواع الخمسة).
 *
 * body: {
 *   PASSWORD, _id,
 *   lectures: [{ lecture_id, title, order, text_ref, questions_lecture_name,
 *                flash_cards, written_exam }],
 *   summary_links: [{ lecture_id, summary_index }]   // ربط الملخص بالفهرس
 * }
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const Update_Lectures = async (req, res) => {
  try {
    const { PASSWORD, _id, lectures, summary_links } = req.body;
    if (!PASSWORD || PASSWORD !== process.env.PASSWORD) {
      return res.status(401).json({ message: "غير مصرح" });
    }
    if (!_id) {
      return res.status(400).json({ message: "رمز المادة ناقص" });
    }
    if (!Array.isArray(lectures)) {
      return res.status(400).json({ message: "قائمة المحاضرات ناقصة" });
    }

    const The_Exam = await Exams.findById(_id);
    if (!The_Exam) {
      return res.status(404).json({ message: "المادة غير موجودة" });
    }

    // ── تنظيف المحاضرات القادمة وترتيبها ──
    const cleanLectures = lectures
      .filter((l) => l && l.lecture_id && (l.title || "").trim())
      .map((l, i) => ({
        lecture_id: String(l.lecture_id),
        title: String(l.title).trim(),
        order: typeof l.order === "number" ? l.order : i,
        text_ref: String(l.text_ref || ""),
        questions_lecture_name: String(l.questions_lecture_name || ""),
        word_count_text: 0,
        word_count_summary: 0,
        flash_cards: (Array.isArray(l.flash_cards) ? l.flash_cards : [])
          .filter((c) => c && c.card_id)
          .map((c) => ({
            card_id: String(c.card_id),
            front: String(c.front || ""),
            back: String(c.back || ""),
          })),
        written_exam: {
          duration_min: Number(l.written_exam?.duration_min) || 30,
          questions: (Array.isArray(l.written_exam?.questions)
            ? l.written_exam.questions
            : []
          )
            .filter((q) => q && q.q_id)
            .map((q) => ({
              q_id: String(q.q_id),
              question: String(q.question || ""),
              model_answer: String(q.model_answer || ""),
            })),
        },
      }))
      .sort((a, b) => a.order - b.order)
      .map((l, i) => ({ ...l, order: i }));

    // ── ربط الملخص: كتابة lecture_id في summary[index].meta ──
    const summaryArr = Array.isArray(The_Exam.summary) ? The_Exam.summary : [];
    const validLectureIds = new Set(cleanLectures.map((l) => l.lecture_id));
    const linkedSummaryByLecture = new Map(); // lecture_id -> summary doc

    // التصفير مشروط: حمولة بلا `summary_links` تعني «لم أُرسل روابط»
    // لا «احذف كل الروابط». التصفير غير المشروط كان يمحو ربط الملخصات
    // كلَّه عند أي حفظ جزئي — وهو ما أفقد المادة ملخصاتها.
    const hasLinkPayload = Array.isArray(summary_links);
    if (hasLinkPayload) {
      summaryArr.forEach((s) => {
        if (s?.meta) s.meta.lecture_id = "";
      });
      summary_links.forEach((link) => {
        const idx = Number(link?.summary_index);
        const lid = String(link?.lecture_id || "");
        if (
          Number.isInteger(idx) &&
          idx >= 0 &&
          idx < summaryArr.length &&
          validLectureIds.has(lid)
        ) {
          if (!summaryArr[idx].meta) summaryArr[idx].meta = {};
          summaryArr[idx].meta.lecture_id = lid;
          linkedSummaryByLecture.set(lid, summaryArr[idx]);
        }
      });
    }

    // ── ترميم ذاتي بالعنوان ──
    // «أنشئ تلقائياً» يولّد lecture_id جديدة، فتفقد الملخصات ارتباطها
    // بمعرّفات لم تعد موجودة. العنوان (meta.lecture_title) ثابت لا يتغيّر،
    // فنعيد الربط به لكل ملخص بقي بلا معرّف صالح.
    const byTitle = new Map();
    cleanLectures.forEach((l) => {
      const t = String(l.title || "").trim();
      if (t) byTitle.set(t, l.lecture_id);
    });
    let healed = 0;
    summaryArr.forEach((s) => {
      if (!s?.meta) return;
      const current = String(s.meta.lecture_id || "");
      if (current && validLectureIds.has(current)) {
        linkedSummaryByLecture.set(current, s);
        return; // ربط سليم — لا نمسّه
      }
      const title = String(s.meta.lecture_title || "").trim();
      const lid = byTitle.get(title);
      if (lid && !linkedSummaryByLecture.has(lid)) {
        s.meta.lecture_id = lid;
        linkedSummaryByLecture.set(lid, s);
        healed += 1;
      }
    });
    if (healed > 0) {
      console.log(`[lectures] رُمّم ربط ${healed} ملخصاً بالعنوان`);
    }

    // ── ربط الأسئلة: كتابة lecture_id في كل سؤال حسب اسم مجموعته ──
    const nameToLectureId = new Map();
    cleanLectures.forEach((l) => {
      if (l.questions_lecture_name.trim()) {
        nameToLectureId.set(l.questions_lecture_name, l.lecture_id);
      }
    });
    const questionsByName = new Map(); // اسم المجموعة -> عدد الأسئلة
    (The_Exam.questions || []).forEach((q) => {
      const name = (q.lecture || "").trim();
      q.lecture_id = name && nameToLectureId.has(name)
        ? nameToLectureId.get(name)
        : "";
      if (name) questionsByName.set(name, (questionsByName.get(name) || 0) + 1);
    });

    // ── إعادة تسمية نص المحاضرة باسمها ──
    // الملف يأتي من المسح باسم عشوائي («1 + 2.md»، «مقرر النظري كامل.md»)،
    // فيصعب تتبّعه. بعد الربط يصير اسمه اسم المحاضرة، فيتطابق ما في
    // القاعدة مع ما يراه الطالب. الاسم مفتاح فريد، فنفضّ التعارض برقم.
    const renamed = [];
    for (const l of cleanLectures) {
      const ref = String(l.text_ref || "").trim();
      const title = String(l.title || "").trim();
      if (!ref || !title) continue;

      const doc = await LectureText.findOne({ rel_path: ref });
      if (!doc) continue;

      const safe = title.replace(/[\\/:*?"<>|]/g, "-").slice(0, 90);
      let file = `${safe}.md`;
      let target = `${doc.section}/${doc.subject}/${file}`;
      if (target === doc.rel_path) continue; // مسمّى صحيحاً أصلاً

      for (let n = 2; n <= 50; n++) {
        const clash = await LectureText.findOne({ rel_path: target })
          .select("_id")
          .lean();
        if (!clash) break;
        file = `${safe} (${n}).md`;
        target = `${doc.section}/${doc.subject}/${file}`;
      }

      const from = doc.rel_path;
      doc.file = file;
      doc.rel_path = target;
      await doc.save();
      l.text_ref = target;
      renamed.push({ from, to: target });
    }
    if (renamed.length > 0) {
      console.log(`[lectures] أُعيدت تسمية ${renamed.length} نص محاضرة`);
    }

    // ── حساب أعداد الكلمات ──
    const textRefs = cleanLectures
      .map((l) => l.text_ref)
      .filter((r) => r.trim());
    const textDocs = textRefs.length
      ? await LectureText.find({ rel_path: { $in: textRefs } })
          .select("rel_path text")
          .lean()
      : [];
    const textByRef = new Map(textDocs.map((d) => [d.rel_path, d.text]));

    cleanLectures.forEach((l) => {
      if (l.text_ref && textByRef.has(l.text_ref)) {
        l.word_count_text = countWords(textByRef.get(l.text_ref));
      } else if (l.text_ref) {
        // مرجع نص لا يقابله وثيقة — رابط معطوب، نصفّره بدل إبقاء وهم
        l.text_ref = "";
      }
      const linkedSummary = linkedSummaryByLecture.get(l.lecture_id);
      l.word_count_summary = linkedSummary
        ? countWords(collectSummaryText(linkedSummary))
        : 0;
    });

    // ── الحفظ ثم اشتقاق الأهلية من الوثيقة نفسها ──
    // نستخدم الوحدة المشتركة (moadal_eligibility) بدل منطق محلي، فتبقى
    // القاعدة واحدة أينما تغيّر المحتوى: هنا أو من محرر المادة.
    The_Exam.lectures = cleanLectures;
    The_Exam.summary = summaryArr;
    const { report: completeness, now: moadal_available } =
      recomputeMoadalAvailability(The_Exam);
    The_Exam.markModified("summary");
    The_Exam.markModified("questions");
    await The_Exam.save();

    res.status(200).json({
      message: "تم حفظ المحاضرات",
      lectures: cleanLectures,
      completeness,
      moadal_available,
      // نعيد روابط الملخص كما استقرّت فعلاً (بعد الربط والترميم)،
      // فتُحدَّث الواجهة من الحقيقة لا من افتراضها
      summary_meta: summaryArr.map((s) => ({
        lecture_id: s?.meta?.lecture_id || "",
        lecture_title: s?.meta?.lecture_title || "",
      })),
      renamed_texts: renamed,
    });
  } catch (error) {
    console.error("Update_Lectures:", error);
    res.status(500).json({ message: "تعذر حفظ المحاضرات", error: error.message });
  }
};
