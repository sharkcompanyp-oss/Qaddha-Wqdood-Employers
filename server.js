import express from "express";
import connection from "./config/db.js";
import router from "./routes/index.js";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

connection();

app.use(cors());
app.use(express.json({ limit: "10mb" })); // أو أكثر حسب الحاجة
app.use(express.urlencoded({ extended: true }));
app.use("/", router);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
