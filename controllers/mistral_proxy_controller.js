import dotenv from "dotenv";

dotenv.config();

// ─── وسيط Mistral ─────────────────────────────────────────────────────────────
// المسح يجري من المتصفّح مباشرةً بمفتاحٍ يُدخله المستخدم في الواجهة (المفتاح
// يتجدّد كل ساعة تقريباً فليس سرّاً يُخزَّن). لكن استدعاء api.mistral.ai من
// صفحةٍ يخضع لسياسة CORS، وهي خارج سيطرتنا وقد تُغلق في أي وقت.
//
// هذا الوسيط شبكة الأمان: نفس الطلب يمرّ عبر خادمنا حين يُمنع المباشر.
// المفتاح يأتي في جسم الطلب ولا يُخزَّن ولا يُسجَّل — الخادم ساعي بريد لا خزنة.

const MISTRAL = "https://api.mistral.ai/v1";

const guard = (req, res) => {
  const { PASSWORD } = req.body || {};
  if (!PASSWORD || PASSWORD !== process.env.PASSWORD) {
    res.status(401).json({ message: "غير مصرّح" });
    return false;
  }
  return true;
};

/** يرفع ملفاً إلى Mistral ويعيد رابطاً موقَّعاً — الخطوتان معاً لأن
 *  الرابط لا يُطلب إلا بمعرّف الملف، وفصلهما يضاعف الرحلات بلا فائدة. */
export const Mistral_Upload = async (req, res) => {
  try {
    if (!guard(req, res)) return;
    const { apiKey, fileName, fileB64 } = req.body;
    if (!apiKey) return res.status(400).json({ message: "مفتاح Mistral ناقص" });
    if (!fileB64) return res.status(400).json({ message: "الملف ناقص" });

    const bytes = Buffer.from(fileB64, "base64");
    const form = new FormData();
    form.append("purpose", "ocr");
    form.append(
      "file",
      new Blob([bytes], { type: "application/pdf" }),
      fileName || "lecture.pdf",
    );

    const up = await fetch(`${MISTRAL}/files`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!up.ok) {
      const t = await up.text();
      return res
        .status(up.status)
        .json({ message: `رفع الملف فشل (${up.status})`, detail: t.slice(0, 300) });
    }
    const uploaded = await up.json();

    const su = await fetch(
      `${MISTRAL}/files/${uploaded.id}/url?expiry=24`,
      { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } },
    );
    if (!su.ok) {
      const t = await su.text();
      return res
        .status(su.status)
        .json({ message: `تعذّر توقيع الرابط (${su.status})`, detail: t.slice(0, 300) });
    }
    const signed = await su.json();

    return res.status(200).json({ file_id: uploaded.id, url: signed.url });
  } catch (error) {
    console.error("Mistral_Upload:", error.message);
    return res
      .status(502)
      .json({ message: "تعذّر الاتصال بـMistral", error: error.message });
  }
};

/** يشغّل الـOCR على رابط موقَّع. include_image_base64 إلزامي: بدونه يشير
 *  الماركداون إلى صور (![img-0.jpeg]) بلا بياناتها فتبقى كل الإشارات مكسورة. */
export const Mistral_Ocr = async (req, res) => {
  try {
    if (!guard(req, res)) return;
    const { apiKey, documentUrl, model } = req.body;
    if (!apiKey) return res.status(400).json({ message: "مفتاح Mistral ناقص" });
    if (!documentUrl) return res.status(400).json({ message: "رابط المستند ناقص" });

    const r = await fetch(`${MISTRAL}/ocr`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || "mistral-ocr-latest",
        document: { type: "document_url", document_url: documentUrl },
        include_image_base64: true,
      }),
    });
    const text = await r.text();
    if (!r.ok) {
      return res
        .status(r.status)
        .json({ message: `المسح فشل (${r.status})`, detail: text.slice(0, 400) });
    }
    // نمرّر الرد كما هو: الصور base64 ضخمة، وإعادة بنائه هدر بلا فائدة
    res.setHeader("Content-Type", "application/json");
    return res.status(200).send(text);
  } catch (error) {
    console.error("Mistral_Ocr:", error.message);
    return res
      .status(502)
      .json({ message: "تعذّر الاتصال بـMistral", error: error.message });
  }
};
