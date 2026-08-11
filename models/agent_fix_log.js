import mongoose from "mongoose";

// ─── سجلّ تصحيحات الوكيل ─────────────────────────────────────────────────────
// الشكوى المعالَجة تُحذف من صندوق الشكاوى (فالصندوق قائمةُ عملٍ لا أرشيف)،
// لكن **ما غيّره الوكيل في المحتوى لا يُمحى**: تعديلٌ آليّ بلا أثرٍ يُراجَع
// خطر — لا تعرف بعده أين تغيّر النصّ ولا لماذا ولا كيف تعيده.
//
// السجلّ منفصل عن الشكاوى قصداً: صندوقك يبقى نظيفاً، والأثر يبقى كاملاً.

const AGENT_FIX_LOG_SCHEMA = new mongoose.Schema({
  // من الشكوى الأصلية
  complaint_id: { type: String, default: "" },
  student_ID: { type: String, default: "" },
  type: { type: String, default: "" },

  // أين وقع التعديل
  subject_id: { type: String, default: "" },
  subject_name: { type: String, default: "" },
  lecture_id: { type: String, default: "" },
  lecture_name: { type: String, default: "" },
  path: { type: String, default: "" }, // lectures.3.questions.12

  // ماذا تغيّر — before/after يكفيان للتراجع اليدوي
  kind: { type: String, default: "" }, // question | summary | flash | written | curriculum
  field: { type: String, default: "" },
  before: { type: String, default: "" },
  after: { type: String, default: "" },

  // لماذا: شاهد النموذج من المحاضرة، وردّه على الطالب
  evidence: { type: String, default: "" },
  student_reply: { type: String, default: "" },
  confidence: { type: Number, default: 0 },
  model: { type: String, default: "" },

  points_awarded: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
});

AGENT_FIX_LOG_SCHEMA.index({ created_at: -1 });
AGENT_FIX_LOG_SCHEMA.index({ subject_id: 1, lecture_id: 1 });

export default mongoose.models.AgentFixLog ||
  mongoose.model("AgentFixLog", AGENT_FIX_LOG_SCHEMA);
