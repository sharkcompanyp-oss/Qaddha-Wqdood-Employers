# الهيكل الجديد للمادة — مصدر واحد

## المبدأ

المحاضرة **كائن واحد يحوي كل ما يخصّها**. لا كولكشن منفصل للنصوص، ولا
مصفوفات موازية على مستوى المادة تُطابَق بالاسم.

المطابقة تكون بـ`lecture_id` **وحده** في كل قارئ. الاسم يبقى حقلاً للعرض
لا للربط.

## لماذا؟

الهيكل القديم يوزّع المحاضرة الواحدة على أربعة مواضع:

| المحتوى | أين كان | مفتاح الربط |
|---|---|---|
| النصّ | كولكشن `LectureText` | `rel_path` (مسار نصّي) |
| الملخص | `subject.summary[]` | `meta.lecture_title` أو `lecture_id` |
| الأسئلة | `subject.questions[]` | `q.lecture` (اسم نصّي) |
| البطاقات والتحريري | `subject.lectures[]` | `lecture_id` |

أربعة مفاتيح مختلفة لشيء واحد. فحرفٌ يختلف في الاسم = محتوى معلَّق لا يراه
الطالب، ولا يظهر العطل إلا في شكوى.

## المخطط

```js
Subject {
  // حقول المادة كما هي — لا تتغيّر
  name, ID, college_id, info, time, visible, open_mode,
  price, price_moadal, admin_id, employer,
  available_to[], available_to_moadal[],
  number_of_free_subscriptions, total_profit, moadal_available,

  lectures: [{
    lecture_id,              // المفتاح الوحيد للمطابقة في كل مكان
    name,                    // للعرض فقط
    order,

    curriculum: {            // نصّ المقرَّر — كان في كولكشن منفصل
      text,                  // ماركداون
      source_file,           // اسم الملف الأصلي (توثيق)
      word_count,            // يُحسب في الخادم
      updated_at,
    },

    summary: {               // كان subject.summary[] يُطابَق بالاسم
      sections: [{ id, number, title, content_blocks[], notes[] }],
      word_count,
    },

    questions: [{            // كانت subject.questions[] تُطابَق بالاسم
      q_id,                  // معرّف ثابت — أساس تتبّع تقدّم الطالب
      question, options[4], answer,
    }],

    flash_cards: [{ card_id, front, back }],

    written_exam: {
      duration_min,
      questions: [{ q_id, question, model_answer }],
    },
  }],

  // الأسئلة التي لا تنتمي لمحاضرة — للمراجعة لا للعرض.
  // لا تُحذف: قد تكون محتوى صالحاً فقد ربطه، وحذفه لا رجعة فيه.
  orphan_questions: [{ question, options[4], answer, was_lecture }],
}
```

## ما يُحذف

- كولكشن `LectureText` (بعد نقل محتواه)
- `subject.summary[]` و`subject.questions[]` على مستوى المادة
- `questions_lecture_name` و`text_ref` — لم يعد لهما معنى
- `q.lecture` النصّي داخل السؤال

## الجلب بالنطاق — لا نقل ما لا يُستعمل

الوثيقة ~٧٠٥ ك.ب بعد الدمج (قِيست على «مرضي خاص»)، وحدّ Mongo ١٦ م.ب فلا
خطر. لكن **نقلها كاملةً في كل طلب هدر**، فالجلب يُسقِط ما لا يُطلب في
القاعدة نفسها عبر `$project` + `$map`:

```js
// خطة «ترفيع»: ملخص وأسئلة فقط — بلا نصوص ولا بطاقات ولا تحريري
{ $project: {
    name: 1, price: 1, college_id: 1, visible: 1,
    lectures: { $map: { input: "$lectures", as: "l", in: {
      lecture_id: "$$l.lecture_id",
      name: "$$l.name",
      order: "$$l.order",
      summary: "$$l.summary",
      questions: "$$l.questions",
    }}},
}}
```

`curriculum.text` — وهو أثقل ما في الوثيقة — لا يُنقَل إلا لمن طلبه.

النطاقات: `list` · `moadal` (كل شيء) · `tarfi3` (ملخص وأسئلة) ·
`lecture` (محاضرة واحدة كاملة) · `curriculum` (نصّ محاضرة وحده).

## قاعدة الاكتمال

المحاضرة «مكتملة» إن كان فيها الخمسة. والمادة مؤهّلة لـ«معدل» إن اكتملت
كل محاضراتها — نفس القاعدة الحالية، لكن الحساب صار محلّياً داخل الكائن
بلا مطابقة أسماء.

## ما يجب أن يتغيّر بعد الهجرة

| القارئ | التغيير |
|---|---|
| تطبيق الطالب: جلب المواد | نطاق `list` |
| تطبيق الطالب: فتح مادة | `tarfi3` أو `moadal` حسب اشتراكه |
| تطبيق الطالب: الخطة | تقرأ من `lectures[]` بـ`lecture_id` |
| تطبيق الطالب: نصّ المقرَّر | `curriculum` بدل `/getlecturetext` |
| اللوحة: قائمة المواد | كما هي (`/exams/names`) |
| اللوحة: مساحة العمل | `lectures[]` مباشرةً |
| اللوحة: الحفظ الجزئي | يكتب داخل الكائن بـ`lecture_id` |
| وكيل الشكاوى | يقرأ `curriculum.text` بدل الكولكشن |
