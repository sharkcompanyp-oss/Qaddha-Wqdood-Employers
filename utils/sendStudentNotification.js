import dotenv from "dotenv";
dotenv.config();

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

    // تحقق إن التوكن Expo token
    if (!data.token.startsWith("ExponentPushToken")) {
      console.error("❌ التوكن مش Expo token:", data.token);
      return;
    }

    console.log("4- جاري إرسال الإشعار...");

    const expoResponse = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        to: data.token,
        title,
        body,
        sound: "default",
      }),
    });

    const result = await expoResponse.json();
    console.log("5- نتيجة الإرسال:", result);

    if (result.data?.status === "error") {
      console.error("❌ خطأ من Expo:", result.data.message);
    } else {
      console.log("✅ تم إرسال الإشعار بنجاح");
    }
  } catch (err) {
    console.error("خطأ في إرسال الإشعار للطالب:", err);
  }
};
