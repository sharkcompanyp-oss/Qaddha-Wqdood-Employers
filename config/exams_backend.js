import dotenv from "dotenv";
dotenv.config();

// ─── عنوان باك اند الطلاب — مصدر واحد ────────────────────────────────────────
// كان كل ملف يقرأ متغيّراً بيده: أربعة ملفات تقرأ `EXAMS_BACKEND_URL`
// وملف الوكيل يقرأ `EXAMS_BACKEND`. و`.env` يعرّف الثاني فقط، فالأربعة كانت
// تقع على القيمة الاحتياطية (الإنتاج) مهما كتب المستخدم في `.env`.
// النتيجة: قبولٌ يتم محلياً ويُبلَّغ به خادم الإنتاج — فلا يصل الطالب
// المتصل بالخادم المحلي شيء، لا بالسوكيت ولا بالإشعار.
//
// نقبل الاسمين (الأول أولوية) ونطبع العنوان مرة عند الإقلاع ليُرى لا يُخمَّن.
const RAW =
  process.env.EXAMS_BACKEND_URL ||
  process.env.EXAMS_BACKEND ||
  "https://exams-back.onrender.com";

export const EXAMS_BACKEND_URL = RAW.replace(/\/+$/, "");

console.log(`[باك اند الطلاب] الإشعارات والسوكيت تُرسَل إلى: ${EXAMS_BACKEND_URL}`);

/**
 * ينادي مساراً داخلياً في باك اند الطلاب ويتحقّق من نجاحه فعلاً.
 *
 * السابق كان `await fetch(...)` داخل try/catch: ردّ 401 أو 500 يُحلّ بنجاح
 * ولا يدخل الـ catch إطلاقاً، فيمرّ الفشل صامتاً تماماً — وهذا ما جعل
 * «قبلتُ الطلب ولم يصل شيء» بلا أي أثر في السجلّ يُستدل به.
 *
 * لا يرمي: التبليغ مكمّل لا شرط. لكنه يُبلغ عن نفسه بوضوح ويعيد النتيجة.
 */
export const callExamsBackend = async (path, payload, label = path) => {
  const url = `${EXAMS_BACKEND_URL}${path}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        INTERNAL_SECRET: process.env.INTERNAL_SECRET,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        `❌ فشل ${label}: ${res.status} من ${url}` +
          (res.status === 401
            ? " — INTERNAL_SECRET لا يطابق ما في باك اند الطلاب"
            : "") +
          (text ? ` | ${text.slice(0, 200)}` : ""),
      );
      return { ok: false, status: res.status };
    }

    return { ok: true, status: res.status };
  } catch (err) {
    // شبكة مقطوعة أو الخادم غير مشغَّل على هذا العنوان
    console.error(`❌ تعذّر الوصول إلى ${url} أثناء ${label}:`, err.message);
    return { ok: false, status: 0, error: err.message };
  }
};
