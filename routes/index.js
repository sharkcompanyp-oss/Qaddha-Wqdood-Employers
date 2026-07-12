import express from "express";
import { Get_Students } from "../controllers/get_students_controller.js";
import { Get_Exams } from "../controllers/get_exams_controller.js";
import { Add_Exam } from "../controllers/add_exam_controller.js";
import { Delete_Student } from "../controllers/delete_student_controller.js";
import { Delete_Exam } from "../controllers/delete_exam_controller.js";
import { Update_Student } from "../controllers/update_student_controller.js";
import { Update_Exam } from "../controllers/update_exam_controller.js";
import { Delete_Score } from "../controllers/delete_score_controller.js";
import { Get_One_Subject } from "../controllers/Get_One_Subject_Controller.js";
import { Add_Student_To_Exam } from "../controllers/Add_Student_To_Exam_Controller.js";
import { Get_Requests } from "../controllers/get_requests_controller.js";
import { Reject_Request } from "../controllers/reject_request_controller.js";
import { Accept_Request } from "../controllers/accept_request_controller.js";
import { Get_Analytics } from "../controllers/analytics_controller.js";
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
import { Store_Classifications } from "../controllers/store_classifications_controller.js";
import {
  Get_Classifications,
  Get_One_Classification,
  Update_Classifications,
  Delete_Classifications,
} from "../controllers/classifications_crud_controller.js";

const router = express.Router();

router.post("/students", Get_Students);
router.post("/exams", Get_Exams);
router.post("/addexam", Add_Exam);
router.delete("/deletestudent", Delete_Student);
router.delete("/deleteexam", Delete_Exam);
router.delete("/deletescore", Delete_Score);
router.put("/updatestudent", Update_Student);
router.put("/updateexam", Update_Exam);
router.post("/getonesubject", Get_One_Subject);
router.post("/addstudenttoexam", Add_Student_To_Exam);
router.post("/getrequests", Get_Requests);
router.delete("/rejectrequest", Reject_Request);
router.post("/acceptrequest", Accept_Request);
router.get("/analytics", Get_Analytics);
router.post("/priceforquestion", set_price_for_question);
router.get("/complaints", Get_Complaints);
router.post("/responde-to-complaint", Responde_To_Complaint);

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

// ─── تصنيفات الذكاء الاصطناعي (كولكشن QuestionClassifications المستقل) ─────────
router.post("/storeclassifications", Store_Classifications);
router.post("/classifications", Get_Classifications);
router.post("/getoneclassification", Get_One_Classification);
router.put("/updateclassifications", Update_Classifications);
router.delete("/deleteclassifications", Delete_Classifications);

router.get("/health", Health);

export default router;
