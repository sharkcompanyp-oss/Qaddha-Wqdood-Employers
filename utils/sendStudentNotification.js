import admin from "firebase-admin";
import { readFileSync } from "fs";
import dotenv from "dotenv";
dotenv.config();

// نفس الـ serviceAccount اللي عندك
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

// هذا السطر يصلح مشكلة الـ newlines على بعض السيرفرات
serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export const sendStudentNotification = async ({ student_ID, title, body }) => {
  try {
    console.log("1- جاري جلب توكن الطالب، student_ID:", student_ID);

    const response = await fetch(
      `https://exams-back.onrender.com/get-student-token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_ID }),
      },
    );

    const data = await response.json();
    console.log("2- التوكن اللي رجع:", data);

    if (!data.token) {
      console.log("3- ما في توكن، إيقاف");
      return;
    }

    console.log("4- جاري إرسال الإشعار...");
    await admin.messaging().send({
      token: data.token,
      notification: { title, body },
    });
    console.log("5- تم إرسال الإشعار بنجاح");
  } catch (err) {
    console.error("خطأ في إرسال الإشعار للطالب:", err);
  }
};
