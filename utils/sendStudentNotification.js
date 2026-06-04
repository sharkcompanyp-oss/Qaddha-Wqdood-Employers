import admin from "firebase-admin";
import { readFileSync } from "fs";

// نفس الـ serviceAccount اللي عندك
const serviceAccount = JSON.parse(readFileSync("./serviceAccount.json"));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export const sendStudentNotification = async ({ student_ID, title, body }) => {
  try {
    // نجيب التوكن من باك تطبيق الطلاب
    const response = await fetch(
      `https://exams-back.onrender.com/get-student-token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_ID }),
      },
    );

    const data = await response.json();
    if (!data.token) return;

    await admin.messaging().send({
      token: data.token,
      notification: { title, body },
    });
  } catch (err) {
    console.error("خطأ في إرسال الإشعار للطالب:", err);
  }
};
