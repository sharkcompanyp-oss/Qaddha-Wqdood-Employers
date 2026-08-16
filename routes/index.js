import express from "express";
import { Get_Students } from "../controllers/get_students_controller.js";
import {
  Get_Exams,
  Get_Exams_Tree,
  Get_Exams_Names,
  Get_Exams_Index,
} from "../controllers/get_exams_controller.js";
import { Add_Exam } from "../controllers/add_exam_controller.js";
import { Delete_Student } from "../controllers/delete_student_controller.js";
import { Delete_Exam } from "../controllers/delete_exam_controller.js";
import { Update_Student } from "../controllers/update_student_controller.js";
import { Update_Exam } from "../controllers/update_exam_controller.js";
import { Delete_Score } from "../controllers/delete_score_controller.js";
import { Get_One_Subject } from "../controllers/Get_One_Subject_Controller.js";
import { Save_Part } from "../controllers/save_part_controller.js";
import {
  Get_Subject_V2,
  Get_Subjects_List_V2,
} from "../controllers/get_subject_v2_controller.js";
import {
  Save_Lecture_V2,
  Manage_Lectures_V2,
} from "../controllers/save_lecture_v2_controller.js";
import {
  List_Unlinked_Texts,
  Get_Text_Full,
  Link_Text_To_Lecture,
} from "../controllers/link_texts_controller.js";
import {
  Upload_Lecture_Images,
  R2_Status,
} from "../controllers/r2_images_controller.js";
import {
  Mistral_Upload,
  Mistral_Ocr,
} from "../controllers/mistral_proxy_controller.js";
import {
  Gemini_Models,
  Spellcheck_Chunk,
} from "../controllers/spellcheck_controller.js";
import { Generate_Items } from "../controllers/generate_controller.js";
import {
  Get_Prompts,
  Reset_Prompts,
  Update_Prompts,
} from "../controllers/prompts_controller.js";
import { Refresh_Moadal } from "../controllers/moadal_refresh_controller.js";
import {
  Archive_Lecture,
  List_Archived,
  Restore_Lecture,
} from "../controllers/archive_controller.js";
import {
  Get_App_Release,
  Update_App_Release,
} from "../controllers/app_release_controller.js";
import {
  Logs_Delete,
  Logs_Fetch,
  Logs_Summary,
} from "../controllers/logs_controller.js";
import {
  Transcribe_Models,
  Transcribe_Status,
  Transcribe_Run,
  Transcribe_Cleanup,
} from "../controllers/transcribe_controller.js";
import { Add_Student_To_Exam } from "../controllers/Add_Student_To_Exam_Controller.js";
import { Get_Requests } from "../controllers/get_requests_controller.js";
import { Reject_Request } from "../controllers/reject_request_controller.js";
import { Accept_Request } from "../controllers/accept_request_controller.js";
import { Get_Analytics } from "../controllers/analytics_controller.js";
import { Get_Student_Plans } from "../controllers/get_student_plans_controller.js";
import { Get_Fix_Log } from "../controllers/get_fix_log_controller.js";
import {
  Preview_Reset_College,
  Reset_College,
} from "../controllers/reset_college_controller.js";
import { Health } from "../controllers/health_Controller.js";
import { set_price_for_question } from "../controllers/price_for_question_controller.js";
import { Get_Complaints } from "../controllers/get_complaints_controller.js";
import { Responde_To_Complaint } from "../controllers/responde_to_complaint_controller.js";
import {
  Get_Agent_Config,
  Update_Agent_Config,
  Run_Agent,
  Upload_Lectures,
  Get_Lectures_Summary,
} from "../controllers/agent_controller.js";
import { Employer_Login } from "../controllers/employer_login_controller.js";
import { Get_Employer_Subjects } from "../controllers/get_employer_subjects_controller.js";
import {
  Get_Employers,
  Add_Employer,
  Update_Employer,
  Delete_Employer,
} from "../controllers/employers_crud_controller.js";
import { Assign_Subject_To_Employer } from "../controllers/assign_subject_controller.js";
import {
  Update_Lectures,
  List_Lecture_Texts,
  Get_Lecture_Text,
} from "../controllers/lectures_controller.js";
import {
  Award_Points,
  Get_Student_Ledger,
} from "../controllers/award_points_controller.js";
import {
  Get_App_AI_Config,
  Update_App_AI_Config,
} from "../controllers/app_ai_controller.js";

const router = express.Router();

router.post("/students", Get_Students);
router.post("/exams", Get_Exams);
// الجلب التدريجي: شجرة الكليات ← أسماء مواد كلية ← مادة بنطاق
router.post("/exams/tree", Get_Exams_Tree);
router.post("/exams/names", Get_Exams_Names);
router.post("/exams/index", Get_Exams_Index);
router.post("/addexam", Add_Exam);
router.delete("/deletestudent", Delete_Student);
router.delete("/deleteexam", Delete_Exam);
router.delete("/deletescore", Delete_Score);
router.put("/updatestudent", Update_Student);
router.put("/updateexam", Update_Exam);
router.post("/getonesubject", Get_One_Subject);
// الحفظ الجزئي: شريحة واحدة من محاضرة واحدة، بلا محاسبة أرباح ولا مساس بالمشتركين
router.put("/exams/save-part", Save_Part);

// ─── الهيكل الموحَّد (v2) ───────────────────────────────────────────────────
// المحاضرة تحمل كل شيء، والمطابقة بـlecture_id وحده. تعمل بالتوازي مع
// المسارات القديمة حتى تكتمل الهجرة، فلا ينقطع قارئ لم يُحدَّث بعد.
router.post("/v2/subject", Get_Subject_V2);
router.post("/v2/subjects", Get_Subjects_List_V2);
router.put("/v2/lecture/save", Save_Lecture_V2);
router.put("/v2/lecture/manage", Manage_Lectures_V2);
// ربط نصوص المقرَّرات يدوياً: أسماء ملفات الكولكشن أرقام مجلدات لا تطابق
// أسماء المحاضرات، فالمطابقة الآلية تخمين. عمليةٌ لمرّة واحدة تُفرغ الكولكشن.
router.post("/v2/texts/unlinked", List_Unlinked_Texts);
router.post("/v2/texts/full", Get_Text_Full);
router.put("/v2/texts/link", Link_Text_To_Lecture);

// خط الإنتاج: الصور إلى R2 (مفاتيحها سرّية فتبقى في الخادم)،
// وMistral عبر وسيطٍ عند منع CORS (المفتاح يمرّ ولا يُخزَّن).
//
// حدّ الجسم العام 10م.ب ولا يكفي هنا: محاضرة PDF بـ12م.ب تصير 16م.ب بعد
// ترميز base64 فتُرفض بـ413 قبل أن تصل المتحكّم. الحدّ الأوسع لهذه
// المسارات وحدها — لا نرفع سقف بقية الواجهة بلا داعٍ.
const bigBody = express.json({ limit: "80mb" });

router.post("/production/r2-status", R2_Status);
router.post("/production/upload-images", bigBody, Upload_Lecture_Images);
router.post("/production/mistral-upload", bigBody, Mistral_Upload);
router.post("/production/mistral-ocr", Mistral_Ocr);
// إعادة حساب أهلية «معدل» للمواد المحفوظة بالتعريف القديم
router.post("/exams/refresh-moadal", Refresh_Moadal);

// ── الأرشيف ──
// المحاضرة تُنقل من المادة لا تُحذف: عمل إنتاجها لا يضيع لأن الدكتور
// غيّر رأيه في منتصف الفصل.
router.put("/archive/lecture", Archive_Lecture);
router.put("/archive/restore", Restore_Lecture);
router.post("/archive/list", List_Archived);

// ── إعلان تحديث التطبيق ──
// القراءة مفتوحة: يستدعيها تطبيق الطالب وهو لا يملك كلمة اللوحة.
router.get("/app/release", Get_App_Release);
router.post("/app/release/update", Update_App_Release);

// ── السجلات ──
// لا يُجلب شيء بمجرّد فتح التبويب: كل سجلّ بطلبٍ صريح.
router.post("/logs/summary", Logs_Summary);
router.post("/logs/fetch", Logs_Fetch);
router.post("/logs/delete", Logs_Delete);

// ── الموجّهات ──
// نصّ كل وكيل معروضٌ ومحرَّرٌ من اللوحة، فلا يبقى موجّهٌ محبوسٌ في الكود.
router.post("/prompts", Get_Prompts);
router.post("/prompts/update", bigBody, Update_Prompts);
router.post("/prompts/reset", Reset_Prompts);

router.post("/production/gemini-models", Gemini_Models);
router.post("/production/spellcheck", Spellcheck_Chunk);
router.post("/production/generate", bigBody, Generate_Items);
// تفريغ الصوت — مسار الرفع مُركَّب في server.js قبل مُحلِّلات الجسم
router.post("/production/transcribe-models", Transcribe_Models);
router.post("/production/transcribe-status", Transcribe_Status);
router.post("/production/transcribe-run", Transcribe_Run);
router.post("/production/transcribe-cleanup", Transcribe_Cleanup);
router.post("/addstudenttoexam", Add_Student_To_Exam);
router.post("/getrequests", Get_Requests);
router.delete("/rejectrequest", Reject_Request);
router.post("/acceptrequest", Accept_Request);
router.get("/analytics", Get_Analytics);
// خطط طالب — للاطّلاع عند مطالبة استرداد
router.post("/student/plans", Get_Student_Plans);
// سجلّ تصحيحات وكيل الشكاوى — الشكاوى المعالَجة تُحذف وأثرها هنا
router.post("/agent/fix-log", Get_Fix_Log);
// تصفير كلية في نهاية الفصل — الاشتراكات وحدها، بمعاينة وتأكيد صريح
router.post("/analytics/reset-preview", Preview_Reset_College);
router.post("/analytics/reset-college", Reset_College);
router.post("/priceforquestion", set_price_for_question);
router.get("/complaints", Get_Complaints);
router.post("/responde-to-complaint", Responde_To_Complaint);

// ─── نظام النقاط (دفتر الحركات + المنح) ────────────────────────────────────
router.post("/awardpoints", Award_Points);
router.post("/studentledger", Get_Student_Ledger);

// ─── كيان المحاضرة (خطة «معدل») ────────────────────────────────────────────
router.put("/updatelectures", Update_Lectures);
router.post("/lecturetexts", List_Lecture_Texts);
router.post("/getlecturetext", Get_Lecture_Text);

// ─── ذكاء التطبيق (نموذج تصحيح الاختبارات التحريرية لكل الطلاب) ────────────
router.post("/appai/config", Get_App_AI_Config);
router.post("/appai/config/update", Update_App_AI_Config);

// ─── وكيل معالجة الشكاوى الذكي ─────────────────────────────────────────────
router.get("/agent/config", Get_Agent_Config);
router.post("/agent/config", Update_Agent_Config);
router.post("/agent/run", Run_Agent);
router.post("/agent/upload-lectures", Upload_Lectures);
router.get("/agent/lectures-summary", Get_Lectures_Summary);

// ─── العضوون ──────────────────────────────────────────────────────────────────
router.post("/employerlogin", Employer_Login);
router.post("/employersubjects", Get_Employer_Subjects);
router.post("/employers", Get_Employers);
router.post("/addemployer", Add_Employer);
router.put("/updateemployer", Update_Employer);
router.delete("/deleteemployer", Delete_Employer);
router.post("/assignsubject", Assign_Subject_To_Employer);

router.get("/health", Health);

export default router;
