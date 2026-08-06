import Exams from "../models/exam.js";

// ─── جلب مادة بنطاق محدَّد ────────────────────────────────────────────────────
// المادة الواحدة تزن ~294 KB (أسئلة 102 + ملخص 176)، وأغلب الشاشات لا تحتاج
// إلا جزءاً منها. النطاق يجعل الطلب بقدر الحاجة لا بقدر الوثيقة.
//
// scope:
//   "full"     — الوثيقة كاملة (السلوك القديم؛ الافتراضي لتوافق العملاء)
//   "meta"     — حقول المادة بلا أسئلة/ملخص/محاضرات (+ أعداد محسوبة)
//   "lectures" — أسماء المحاضرات فقط، لاختيار واحدة
//   "lecture"  — كل ما يخصّ محاضرة واحدة (ملخص، أسئلة، فلاش، تحريري)
//   "part"     — جزء واحد من محاضرة (part: summary|questions|flash|written)

const LIGHT_FIELDS = [
  "name",
  "ID",
  "info",
  "college_id",
  "time",
  "visible",
  "open_mode",
  "price",
  "price_moadal",
  "moadal_available",
  "admin_id",
  "employer",
  "number_of_free_subscriptions",
];

const pickLight = (doc) => {
  const out = { _id: doc._id };
  LIGHT_FIELDS.forEach((f) => {
    if (doc[f] !== undefined) out[f] = doc[f];
  });
  return out;
};

// ملخص محاضرة بعينها + فهرسه. الفهرس هو مفتاح الحفظ الجزئي:
// عناصر الملخص بلا _id، فهويتها موضعها في المصفوفة.
const summaryFor = (doc, lectureId, lectureTitle) => {
  const arr = Array.isArray(doc.summary) ? doc.summary : [];
  const i = arr.findIndex(
    (s) =>
      (s?.meta?.lecture_id && s.meta.lecture_id === lectureId) ||
      (lectureTitle && s?.meta?.lecture_title === lectureTitle),
  );
  return i >= 0 ? { summary_index: i, summary: arr[i] } : { summary_index: -1 };
};

// أسئلة محاضرة بعينها مع فهارسها الأصلية — التعديل بالفهرس يستلزم معرفة
// الموضع في المصفوفة الكاملة حتى لا تُزحزح أسئلة محاضرات أخرى.
const questionsFor = (doc, lectureId, groupName) => {
  const out = [];
  (Array.isArray(doc.questions) ? doc.questions : []).forEach((q, index) => {
    const byId = lectureId && q.lecture_id === lectureId;
    const byName = groupName && q.lecture === groupName;
    if (byId || byName) out.push({ index, question: q });
  });
  return out;
};

export const Get_One_Subject = async (req, res) => {
  try {
    const { _id, scope = "full", lecture_id, part } = req.body;

    if (!_id) {
      return res.status(400).json({ message: "معرّف المادة مطلوب" });
    }

    // قراءة واحدة، ثم تُشتق النطاقات منها في الذاكرة
    const doc = await Exams.findById(_id).lean();
    if (!doc) {
      // `return` إلزامي: بدونه يُرسل 404 ثم يُتبَع بـ200 وجسم فارغ،
      // فيظنّ العميل أن المادة موجودة وقيمتها null.
      return res.status(404).json({ message: "المادة غير موجودة" });
    }

    if (scope === "meta") {
      return res.status(200).json({
        ...pickLight(doc),
        questions_count: (Array.isArray(doc.questions) ? doc.questions : []).length,
        summary_count: (Array.isArray(doc.summary) ? doc.summary : []).length,
        lectures_count: (Array.isArray(doc.lectures) ? doc.lectures : []).length,
      });
    }

    if (scope === "lectures") {
      return res.status(200).json({
        _id: doc._id,
        name: doc.name,
        // عناوين الملخص ومجموعات الأسئلة: خط الإنتاج يطابق بها اسم ملف
        // الماركداون قبل الرفع. اسمٌ لا يطابق شيئاً يعني محاضرةً معلّقة
        // لا يراها الطالب — والتحذير أرخص من اكتشافها بعد الرفع.
        summary_titles: [
          ...new Set(
            (doc.summary || [])
              .map((s) => (s?.meta?.lecture_title || "").trim())
              .filter(Boolean),
          ),
        ],
        question_groups: [
          ...new Set(
            (doc.questions || [])
              .map((q) => (q?.lecture || "").trim())
              .filter(Boolean),
          ),
        ],
        lectures: (doc.lectures || [])
          .slice()
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((l) => ({
            lecture_id: l.lecture_id,
            title: l.title,
            order: l.order,
            has_text: Boolean((l.text_ref || "").trim()),
            has_summary: (Array.isArray(doc.summary) ? doc.summary : []).some(
              (s) => s?.meta?.lecture_id === l.lecture_id,
            ),
            questions_count: (Array.isArray(doc.questions) ? doc.questions : []).filter(
              (q) => q.lecture_id === l.lecture_id,
            ).length,
            flash_count: (Array.isArray(l.flash_cards) ? l.flash_cards : []).length,
            written_count: (l.written_exam?.questions || []).length,
          })),
      });
    }

    if (scope === "lecture" || scope === "part") {
      const lecture = (Array.isArray(doc.lectures) ? doc.lectures : []).find(
        (l) => l.lecture_id === lecture_id,
      );
      if (!lecture) {
        return res.status(404).json({ message: "المحاضرة غير موجودة" });
      }

      const wants = (k) => scope === "lecture" || part === k;
      const payload = {
        _id: doc._id,
        name: doc.name,
        // حارس التزامن للحفظ الجزئي: يقارنه الخادم عند الكتابة، فإن تغيّر
        // العدد بيننا فقد عدّل أحدٌ المادة والكتابة تدهس عمله.
        total_questions: (Array.isArray(doc.questions) ? doc.questions : []).length,
        lecture: {
          lecture_id: lecture.lecture_id,
          title: lecture.title,
          order: lecture.order,
          text_ref: lecture.text_ref,
          questions_lecture_name: lecture.questions_lecture_name,
        },
      };

      if (wants("summary")) {
        Object.assign(
          payload,
          summaryFor(doc, lecture.lecture_id, lecture.title),
        );
      }
      if (wants("questions")) {
        payload.questions = questionsFor(
          doc,
          lecture.lecture_id,
          lecture.questions_lecture_name,
        );
      }
      if (wants("flash")) payload.flash_cards = Array.isArray(lecture.flash_cards) ? lecture.flash_cards : [];
      if (wants("written")) {
        payload.written_exam = lecture.written_exam || {
          duration_min: 30,
          questions: [],
        };
      }
      // نص المقرر لا يُرسل هنا: يُجلب من كولكشن LectureText عبر
      // /getlecturetext بمفتاح text_ref — فلا نضخّم هذا الرد بنصّ كامل.
      return res.status(200).json(payload);
    }

    // الافتراضي: الوثيقة كاملة (توافق مع العملاء الحاليين)
    return res.status(200).json(doc);
  } catch (err) {
    console.error("Get_One_Subject:", err);
    return res.status(500).json({ message: "حدث خطأ في الخادم." });
  }
};
