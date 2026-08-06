import Exams from "../models/exam.js";
import { recomputeMoadalAvailability } from "../services/moadal_eligibility.js";
import dotenv from "dotenv";

dotenv.config();

// ─── الحفظ الجزئي ─────────────────────────────────────────────────────────────
// Update_Exam يكتب المادة كاملةً ويمرّ بمحاسبة أرباح الأدمن. تعديل بطاقة فلاش
// واحدة لا يجوز أن يرسل 294 KB ولا أن يقترب من الأرباح ولا من المشتركين.
// هذا المسار يكتب شريحةً واحدة معلومة الحدود، ولا يلمس ما سواها.
//
// body: { PASSWORD, _id, lecture_id, part, payload }
//   part: "summary" | "questions" | "flash" | "written" | "meta" | "all"
//   "all" = المحاضرة كاملة (كل ما ورد في payload من الأجزاء أعلاه)
//
// الأمان: كل جزء يُتحقَّق من أنه يخصّ هذه المحاضرة قبل الكتابة. الشريحة التي
// لا تُذكر في payload لا تُمَسّ إطلاقاً — الغياب يعني «لا تلمس» لا «احذف».

const guard = (req, res) => {
  const { PASSWORD } = req.body;
  if (!PASSWORD || PASSWORD !== process.env.PASSWORD) {
    res.status(401).json({ message: "غير مصرّح" });
    return false;
  }
  return true;
};

/** أسئلة المحاضرة بفهارسها الأصلية — نفس منطق الجلب حرفياً حتى لا يختلف
 *  ما يراه المحرّر عمّا يعرفه الحافظ. */
const ownedQuestionIndices = (doc, lectureId, groupName) => {
  const out = [];
  (doc.questions || []).forEach((q, i) => {
    const byId = lectureId && q.lecture_id === lectureId;
    const byName = groupName && q.lecture === groupName;
    if (byId || byName) out.push(i);
  });
  return out;
};

export const Save_Part = async (req, res) => {
  try {
    if (!guard(req, res)) return;

    const { _id, lecture_id, part = "all", payload = {} } = req.body;

    if (!_id) return res.status(400).json({ message: "رمز المادة ناقص" });
    if (!lecture_id) {
      return res.status(400).json({ message: "رمز المحاضرة ناقص" });
    }

    const exam = await Exams.findById(_id);
    if (!exam) return res.status(404).json({ message: "المادة غير موجودة" });

    const lecture = (exam.lectures || []).find(
      (l) => l.lecture_id === lecture_id,
    );
    if (!lecture) {
      return res.status(404).json({ message: "المحاضرة غير موجودة" });
    }

    const wants = (k) => part === "all" || part === k;
    const changed = [];

    // ─── عنوان المحاضرة واسم مجموعة أسئلتها ───────────────────────────────────
    // يُعدَّل قبل الأسئلة: تغيير الاسم يغيّر ما تملكه المحاضرة، والأسئلة
    // المرسلة تُختَم بالاسم الجديد فيبقى الطرفان متّسقين.
    if (wants("meta")) {
      if (typeof payload.title === "string" && payload.title.trim()) {
        lecture.title = payload.title.trim();
        changed.push("title");
      }
      if (typeof payload.questions_lecture_name === "string") {
        lecture.questions_lecture_name = payload.questions_lecture_name.trim();
        changed.push("questions_lecture_name");
      }
    }

    // ─── الملخص ───────────────────────────────────────────────────────────────
    if (wants("summary") && payload.summary !== undefined) {
      if (payload.summary === null) {
        // حذف صريح: يُطلب بـ null لا بالغياب
        const arr = exam.summary || [];
        const i = arr.findIndex((s) => s?.meta?.lecture_id === lecture_id);
        if (i >= 0) {
          arr.splice(i, 1);
          exam.summary = arr;
          changed.push("summary:deleted");
        }
      } else {
        const incoming = payload.summary;
        // نختم الهوية في الخادم لا في العميل: ملخصٌ بلا lecture_id صحيح
        // يكسر أهلية «معدل» ويظهر للطالب تحت محاضرة أخرى.
        incoming.meta = {
          ...(incoming.meta || {}),
          lecture_id,
          lecture_title: incoming.meta?.lecture_title || lecture.title || "",
        };
        const arr = exam.summary || [];
        const i = arr.findIndex(
          (s) =>
            s?.meta?.lecture_id === lecture_id ||
            (lecture.title && s?.meta?.lecture_title === lecture.title),
        );
        if (i >= 0) arr[i] = incoming;
        else arr.push(incoming);
        exam.summary = arr;
        changed.push(i >= 0 ? "summary" : "summary:added");
      }
    }

    // ─── الأسئلة ──────────────────────────────────────────────────────────────
    // البروتوكول: العميل يرسل القائمة الكاملة لأسئلة هذه المحاضرة، والخادم
    // يستبدل ما تملكه المحاضرة حالياً بها — إدراجاً في موضع أولها حتى لا
    // تُزحزح أسئلة المحاضرات الأخرى ولا يتبعثر ترتيب المادة.
    if (wants("questions") && Array.isArray(payload.questions)) {
      // الاسم هنا هو نفسه المستعمل في الجلب — بلا تراجع إلى title.
      // لو ملك الحافظُ أكثر ممّا أرى الجالبُ، لحذف الحفظُ أسئلةً لم يرها
      // المحرّر أصلاً: يفتح محاضرةً فيجدها بلا أسئلة، فيحفظ، فتختفي أسئلتها.
      let groupName = lecture.questions_lecture_name || "";
      const owned = ownedQuestionIndices(exam, lecture_id, groupName);

      // محاضرة بلا اسم مجموعة: الأسئلة المحفوظة ستحمل lecture: "" وأهلية
      // «معدل» تَعُدّ بالاسم، فتبدو المحاضرة بلا أسئلة إلى الأبد. نداوي هذا
      // بالعنوان — لكن فقط إن لم يكن العنوان مستعملاً في أسئلة لا نملكها،
      // وإلا خلطنا مجموعتين لا تُفرَّقان بعدها.
      if (!groupName) {
        const title = (lecture.title || "").trim();
        const ownedSet0 = new Set(owned);
        const strangersUnderTitle = (exam.questions || []).some(
          (q, i) => !ownedSet0.has(i) && (q.lecture || "").trim() === title,
        );
        if (!title || strangersUnderTitle) {
          return res.status(409).json({
            message: strangersUnderTitle
              ? `هناك أسئلة باسم «${title}» غير مرتبطة بهذه المحاضرة. اربط مجموعة الأسئلة من شاشة «المحاضرات» أولاً حتى لا تختلط المجموعتان.`
              : "هذه المحاضرة بلا اسم مجموعة أسئلة ولا عنوان. اضبطهما من شاشة «المحاضرات» قبل حفظ الأسئلة.",
          });
        }
        groupName = title;
        lecture.questions_lecture_name = title;
        changed.push("questions_lecture_name:auto");
      }

      // حارس تزامن: العميل يرسل عدد الأسئلة الذي رآه عند الجلب. اختلافه
      // يعني أن أحداً عدّل المادة بيننا، والكتابة عندها تدهس عمله.
      if (
        payload.total_at_fetch !== undefined &&
        Number(payload.total_at_fetch) !== (exam.questions || []).length
      ) {
        return res.status(409).json({
          message:
            "تغيّرت أسئلة المادة أثناء تعديلك. أعد فتح المحاضرة لتحديث نسختك ثم احفظ.",
          expected: Number(payload.total_at_fetch),
          actual: (exam.questions || []).length,
        });
      }

      const cleaned = payload.questions
        .filter((q) => q && String(q.question || "").trim())
        .map((q) => ({
          question: String(q.question || ""),
          // أربعة بالضبط: تطبيق الطالب يقرأ [0..3] والمحرّر يعرض أربعة حقول،
          // فما زاد لا يُرى ولا يُحرَّر، وما نقص يترك زرّ إجابةٍ بلا خيار.
          options: Array.from({ length: 4 }, (_, i) =>
            String((Array.isArray(q.options) ? q.options[i] : "") ?? ""),
          ),
          answer: String(q.answer ?? ""),
          // الختم بالهوية إلزامي: أهلية «معدل» تَعُدّ بالاسم، والجلب يَعُدّ
          // بالمعرّف — فلو نقص أحدهما بدت المحاضرة بلا أسئلة لأحد الطرفين.
          lecture: groupName,
          lecture_id,
        }));

      const all = (exam.questions || []).map((q) =>
        q.toObject ? q.toObject() : q,
      );
      const at = owned.length ? owned[0] : all.length;
      const ownedSet = new Set(owned);
      const rest = all.filter((_, i) => !ownedSet.has(i));
      // موضع الإدراج بعد الحذف: كم عنصراً باقياً يسبق الموضع الأصلي
      const insertAt = all
        .slice(0, at)
        .filter((_, i) => !ownedSet.has(i)).length;
      rest.splice(insertAt, 0, ...cleaned);
      exam.questions = rest;
      changed.push(`questions:${owned.length}→${cleaned.length}`);
    }

    // ─── بطاقات الاسترجاع ─────────────────────────────────────────────────────
    if (wants("flash") && Array.isArray(payload.flash_cards)) {
      lecture.flash_cards = payload.flash_cards
        .filter((c) => c && (String(c.front || "").trim() || String(c.back || "").trim()))
        .map((c, i) => ({
          // card_id مطلوب في المخطط — التوليد هنا يمنع فشل حفظٍ صامت
          card_id: String(c.card_id || `${lecture_id}_c${i + 1}`),
          front: String(c.front || ""),
          back: String(c.back || ""),
        }));
      changed.push(`flash:${(lecture.flash_cards || []).length}`);
    }

    // ─── الاختبار التحريري ────────────────────────────────────────────────────
    if (wants("written") && payload.written_exam !== undefined) {
      const w = payload.written_exam || {};
      lecture.written_exam = {
        duration_min: Number(w.duration_min) > 0 ? Number(w.duration_min) : 30,
        questions: (Array.isArray(w.questions) ? w.questions : [])
          .filter((q) => q && String(q.question || "").trim())
          .map((q, i) => ({
            q_id: String(q.q_id || `${lecture_id}_w${i + 1}`),
            question: String(q.question || ""),
            model_answer: String(q.model_answer || ""),
          })),
      };
      changed.push(`written:${(lecture.written_exam.questions || []).length}`);
    }

    // ─── ربط نص المقرر ────────────────────────────────────────────────────────
    // النص نفسه يعيش في كولكشن LectureText ويُحفظ عبر /updatelectures؛
    // هنا لا نحفظ إلا الربط، وإفراغه عمل صريح لا نتيجة غياب.
    if (wants("text") && typeof payload.text_ref === "string") {
      lecture.text_ref = payload.text_ref.trim();
      changed.push("text_ref");
    }

    if (changed.length === 0) {
      return res
        .status(200)
        .json({ message: "لا تغييرات", changed: [], moadal_available: exam.moadal_available });
    }

    // الأهلية تُعاد حسبتها على الوثيقة كاملةً لا على الشريحة: حذف أسئلة
    // محاضرة واحدة يُسقط أهلية المادة كلها، ولا سبيل لمعرفة ذلك من الشريحة.
    const eligibility = recomputeMoadalAvailability(exam);
    if (eligibility.changed) {
      console.log(
        `[معدل] ${exam.name}: الأهلية ${eligibility.was} → ${eligibility.now} (حفظ جزئي: ${part})`,
      );
    }

    await exam.save();

    return res.status(200).json({
      message: "تم الحفظ",
      changed,
      part,
      lecture_id,
      moadal_available: exam.moadal_available,
      // العميل يحدّث حارس التزامن بلا إعادة جلب
      total_questions: (exam.questions || []).length,
    });
  } catch (error) {
    console.error("Save_Part:", error);
    return res
      .status(500)
      .json({ message: "تعذّر الحفظ", error: error.message });
  }
};
