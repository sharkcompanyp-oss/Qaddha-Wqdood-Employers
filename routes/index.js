import express from "express";
import { Get_Students } from "../controllers/get_students_controller.js";
import { Get_Exams } from "../controllers/get_exams_controller.js";
import { Add_Student } from "../controllers/add_student_controller.js";
import { Add_Exam } from "../controllers/add_exam_controller.js";
import { Delete_Student } from "../controllers/delete_student_controller.js";
import { Delete_Exam } from "../controllers/delete_exam_controller.js";
import { Update_Student } from "../controllers/update_student_controller.js";
import { Update_Exam } from "../controllers/update_exam_controller.js";
import { Delete_Score } from "../controllers/delete_score_controller.js";
import { Get_Admin_Info } from "../controllers/get_admin_info_controller.js";
import { Total_Profit_Edit } from "../controllers/Admin_Profit_Controller.js";
import { Get_One_Subject } from "../controllers/Get_One_Subject_Controller.js";
const router = express.Router();

router.get("/students", Get_Students);
router.get("/admininfo", Get_Admin_Info);
router.post("/exams", Get_Exams);
router.post("/addstudent", Add_Student);
router.post("/addexam", Add_Exam);
router.delete("/deletestudent", Delete_Student);
router.delete("/deleteexam", Delete_Exam);
router.delete("/deletescore", Delete_Score);
router.put("/updatestudent", Update_Student);
router.put("/updateexam", Update_Exam);
router.post("/totalprofitedit", Total_Profit_Edit);
router.post("/getonesubject", Get_One_Subject);

export default router;
