import mongoose from "mongoose";
const COMPLAINT_SCHEMA = mongoose.Schema({
  student_ID: { type: String, required: true },
  type: { type: String, required: true },
  section_id: { type: String, required: false },
  lecture_name: { type: String, required: false },
  subject_name: { type: String, required: false },
  college_name: { type: String, required: false },
  university_name: { type: String, required: false },
  question: { type: String, required: false },
  student_name: { type: String, required: false },
  whatsapp_number: { type: String, required: false },
  complaint: { type: String, required: false },

  // ─── المعرّفان الحاسمان ─────────────────────────────────────────────────────
  // الأسماء وحدها لا تكفي للوصول إلى المحتوى: يكتبها الطالب بيده فتتصحّف،
  // وتتكرر المادة الواحدة بين كليات. بهذين يفتح الوكيل المحاضرة بعينها
  // بلا تخمين — وهو شرط أن يعدّل الحقل الصحيح.
  subject_id: { type: String, required: false, default: "" },
  lecture_id: { type: String, required: false, default: "" },

  // موضع العنصر داخل المحاضرة — يرسله زرّ الإبلاغ فوق البطاقة أو تحت
  // سؤال التحريري. الفهرس أدقّ من أي مطابقة نصّية: يصل الوكيل إلى
  // العنصر مباشرةً حتى لو تشابه نصّه مع غيره.
  item_index: { type: Number, required: false, default: null },
  item_text: { type: String, required: false, default: "" },
  item_answer: { type: String, required: false, default: "" },
  card_front: { type: String, required: false, default: "" },
  card_back: { type: String, required: false, default: "" },
  model_answer: { type: String, required: false, default: "" },

  // الشكوى المعالَجة تُحذف — الصندوق قائمةُ عملٍ لا أرشيف. أثر ما غيّره
  // الوكيل في المحتوى يُحفظ في AgentFixLog (models/agent_fix_log.js).
  created_at: { type: Date, default: Date.now },
});

export default mongoose.model("complaint", COMPLAINT_SCHEMA);
