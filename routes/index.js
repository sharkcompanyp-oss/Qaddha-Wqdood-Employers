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
import { Get_Exams_By_Admin_Id } from "../controllers/get_exams_by_admin_id_controller.js";
import { Reject_Request } from "../controllers/reject_request_controller.js";
import { Accept_Request } from "../controllers/accept_request_controller.js";

const router = express.Router();

router.get("/students", Get_Students);
router.post("/exams", Get_Exams);
router.post("/addexam", Add_Exam);
router.delete("/deletestudent", Delete_Student);
router.delete("/deleteexam", Delete_Exam);
router.delete("/deletescore", Delete_Score);
router.put("/updatestudent", Update_Student);
router.put("/updateexam", Update_Exam);
router.post("/getonesubject", Get_One_Subject);
router.post("/addstudenttoexam", Add_Student_To_Exam);
router.get("/getrequests", Get_Requests);
router.post("/getexamsbyadminid", Get_Exams_By_Admin_Id);
router.delete("/rejectrequest", Reject_Request);
router.post("/acceptrequest", Accept_Request);

export default router;
