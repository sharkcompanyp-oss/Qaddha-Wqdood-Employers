import express from "express";
import connection from "./config/db.js";
import router from "./routes/index.js";
import { Transcribe_Upload } from "./controllers/transcribe_controller.js";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

connection();

app.use(cors());

// رفع الصوت **قبل** أي مُحلِّل جسم: التسجيل يُمرَّر مجرىً إلى Google بلا
// تجميع في الذاكرة. لو مرّ بمُحلِّل لجُمِع الملف كلّه أولاً — وتسجيل ساعة
// يتجاوز عندها سعة الخادم. مركزه هنا يجعل الأمر يقيناً لا اعتماداً على
// أن express.json يتخطّى ما ليس JSON.
app.post("/production/transcribe-upload", Transcribe_Upload);

app.use(express.json({ limit: "10mb" })); // أو أكثر حسب الحاجة
app.use(express.urlencoded({ extended: true }));
app.use("/", router);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
