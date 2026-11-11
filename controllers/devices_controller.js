import DeviceSession from "../models/device_session.js";
import DeviceAlert from "../models/device_alert.js";
import Students from "../models/student.js";
import { isPanel } from "../services/access.js";

// ─── تبويب «الأجهزة»: حسابات تُستخدم على أكثر من جهاز، وحظر ما يختاره المشرف ──
// باك اند الطلاب (EXAMS/backend/services/device_watch.js) يسجّل كل «جلسة»:
// تسجيل دخول واحد على جهاز واحد، ويكشف الجلسات المتزامنة. هنا نعرضها مجمّعةً
// في «أجهزة»، ونكتب حقل `blocked` فقط. أثر الحظر يقع في باك اند الطلاب:
//   • جلب المواد بتوكن الجهاز المحظور → يُرفض فيخرج من الحساب.
//   • تسجيل دخول جديد بمعرّف جهازه → يُرفض برسالة، ما لم يحمل جهازٌ غير
//     محظور للحساب نفسه المعرّفَ ذاته (لا نحظر ما لا نستطيع تمييزه).

const DAY = 24 * 60 * 60 * 1000;
const ALTERNATING = 3; // انتقالات بين جهازين: 1–2 تبديل موبايل، 3+ تناوب

const PLATFORM_LABEL = {
  "android-app": "تطبيق أندرويد",
  "ios-app": "تطبيق آيفون",
  "iphone-web": "الموقع على آيفون",
  "android-web": "متصفح أندرويد",
  "desktop-web": "متصفح حاسوب",
  other: "غير معروف",
};

// confirmed: تناوب مؤكد · probable: تناوب محتمل · switch: تبديل موبايل
// same: غالباً نفس الجهاز · none: لا تنبيه (حظرٌ يدوي مثلاً)
const CAT_RANK = { confirmed: 4, probable: 3, switch: 2, same: 1, none: 0 };

const ms = (d) => (d ? new Date(d).getTime() : 0);
const uniq = (arr) => [...new Set(arr.filter(Boolean))];
const isUnknown = (v) => /^unknown$/i.test(String(v || "").trim());

/** معرّف جهاز حقيقي (userAgent الموقع و"unknown" ليسا معرّفين) */
const realDevice = (d) => {
  const s = String(d || "").trim();
  if (!s || isUnknown(s) || /mozilla|applewebkit/i.test(s)) return "";
  return s;
};

const classify = (a) => {
  const alt = (a.switches || 1) >= ALTERNATING;
  if (a.level === "high") return alt ? "confirmed" : "switch";
  if (a.level === "medium") return alt ? "probable" : "switch";
  return "same";
};

// ─── تجميع الجلسات في أجهزة ───
// جلستان بالمعرّف الحقيقي نفسه أو بتوكن الإشعارات نفسه = الجهاز نفسه
// (إعادة دخول، أو توكن قديم عُرف تثبيته من توكن إشعاراته).
const summarize = (list) => {
  const newest = list.reduce((a, b) => (ms(b.last_seen) > ms(a.last_seen) ? b : a));
  const loginValues = uniq(
    list.map((s) => (isUnknown(s.login_device) ? "" : String(s.login_device || ""))),
  );
  const blockedAll = list.every((s) => s.blocked);
  return {
    key: newest.sid,
    label: newest.device || PLATFORM_LABEL[newest.platform] || "غير معروف",
    platform: newest.platform || "other",
    ids: uniq(list.map((s) => realDevice(s.login_device))),
    pushes: uniq(list.map((s) => s.push)),
    login_values: loginValues,
    ua: newest.ua || "",
    sids: list.map((s) => s.sid),
    sessions: list.length,
    started: new Date(Math.min(...list.map((s) => ms(s.login_at || s.first_seen)))),
    last_seen: new Date(Math.max(...list.map((s) => ms(s.last_seen)))),
    hits: list.reduce((n, s) => n + (s.hits || 0), 0),
    ips: uniq(list.flatMap((s) => s.ips || [])).slice(-8),
    last_ip: newest.last_ip || "",
    legacy: list.every((s) => s.origin !== "login"),
    blocked: blockedAll,
    partly_blocked: !blockedAll && list.some((s) => s.blocked),
    blocked_at: list.reduce((m, s) => (ms(s.blocked_at) > ms(m) ? s.blocked_at : m), null),
    blocked_hits: list.reduce((n, s) => n + (s.blocked_hits || 0), 0),
    blocked_seen_at: list.reduce(
      (m, s) => (ms(s.blocked_seen_at) > ms(m) ? s.blocked_seen_at : m),
      null,
    ),
  };
};

const groupDevices = (sessions) => {
  const parent = new Map(sessions.map((s) => [s.sid, s.sid]));
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  const owner = new Map();
  sessions.forEach((s) => {
    const real = realDevice(s.login_device);
    [real && `id:${real}`, s.push && `push:${s.push}`].filter(Boolean).forEach((k) => {
      if (!owner.has(k)) owner.set(k, s.sid);
      else {
        const a = find(s.sid);
        const b = find(owner.get(k));
        if (a !== b) parent.set(a, b);
      }
    });
  });
  const groups = new Map();
  sessions.forEach((s) => {
    const r = find(s.sid);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(s);
  });
  const devices = [...groups.values()].map(summarize).sort((a, b) => ms(b.started) - ms(a.started));

  // هل يمنع الحظرُ عودتَه بتسجيل دخول جديد؟
  //   no_id   توكن من قبل المراقبة بلا معرّف: الحظر يُخرجه، وإن عاد يظهر جهازاً جديداً
  //   shared  معرّفه يحمله جهاز آخر لهذا الحساب (آيفونان بالبصمة نفسها): يُخرجه فقط
  //   ok      يُخرجه ويمنع دخوله مجدداً
  devices.forEach((d) => {
    if (!d.login_values.length) d.relogin = "no_id";
    else if (
      d.login_values.some((v) =>
        devices.some((o) => o !== d && o.login_values.includes(v)),
      )
    )
      d.relogin = "shared";
    else d.relogin = "ok";
  });
  return devices;
};

/** body: { PASSWORD, days? } — الحسابات المشتبه بها + إحصاءات */
export const Devices_Overview = async (req, res) => {
  try {
    if (!isPanel(req)) return res.status(401).json({ message: "غير مصرّح" });
    const days = Math.min(365, Math.max(1, Number(req.body?.days) || 60));
    const now = Date.now();
    const since = new Date(now - days * DAY);

    const [alerts, logins, blockedStudents, active] = await Promise.all([
      DeviceAlert.find({ kind: "concurrent", last_at: { $gte: since } })
        .select("student student_ID name level switches last_at reasons")
        .lean(),
      DeviceAlert.find({ kind: "new_device_login", last_at: { $gte: since } })
        .sort({ last_at: -1 })
        .limit(200)
        .select("student student_ID name bound_device new_device platform hits last_at")
        .lean(),
      DeviceSession.distinct("student", { blocked: true }),
      DeviceSession.distinct("student", { last_seen: { $gte: new Date(now - 7 * DAY) } }),
    ]);

    const accounts = new Map();
    const touch = (student, seed) => {
      const k = String(student);
      if (!accounts.has(k))
        accounts.set(k, {
          student: k,
          student_ID: seed.student_ID ?? null,
          name: seed.name || "",
          category: "none",
          switches: 0,
          last_at: null,
          reasons: [],
        });
      return accounts.get(k);
    };
    alerts.forEach((a) => {
      const acc = touch(a.student, a);
      const cat = classify(a);
      if (CAT_RANK[cat] > CAT_RANK[acc.category]) acc.category = cat;
      acc.switches = Math.max(acc.switches, a.switches || 1);
      if (ms(a.last_at) > ms(acc.last_at)) acc.last_at = a.last_at;
      acc.reasons = uniq([...acc.reasons, ...(a.reasons || [])]).slice(0, 4);
    });
    blockedStudents.forEach((s) => touch(s, {}));

    const ids = [...accounts.keys()];
    const sessions = ids.length
      ? await DeviceSession.find({ student: { $in: ids } })
          .select("sid student student_ID name origin login_at login_device platform device push first_seen last_seen hits blocked blocked_at blocked_hits blocked_seen_at ips last_ip ua")
          .lean()
      : [];
    const byStudent = new Map();
    sessions.forEach((s) => {
      const k = String(s.student);
      if (!byStudent.has(k)) byStudent.set(k, []);
      byStudent.get(k).push(s);
    });

    const list = [...accounts.values()].map((acc) => {
      const own = byStudent.get(acc.student) || [];
      const devices = groupDevices(own);
      const named = own.find((s) => s.student_ID != null) || {};
      return {
        ...acc,
        student_ID: acc.student_ID ?? named.student_ID ?? null,
        name: acc.name || named.name || "",
        devices: devices.length,
        blocked_devices: devices.filter((d) => d.blocked).length,
        last_seen: devices.reduce((m, d) => (ms(d.last_seen) > ms(m) ? d.last_seen : m), null),
        blocked_hits: devices.reduce((n, d) => n + (d.blocked_hits || 0), 0),
      };
    });
    list.forEach((a) => (a.handled = a.blocked_devices > 0));
    list.sort(
      (a, b) =>
        Number(a.handled) - Number(b.handled) ||
        CAT_RANK[b.category] - CAT_RANK[a.category] ||
        b.switches - a.switches ||
        ms(b.last_at || b.last_seen) - ms(a.last_at || a.last_seen),
    );

    const count = (cat) => list.filter((a) => !a.handled && a.category === cat).length;
    return res.status(200).json({
      days,
      stats: {
        confirmed: count("confirmed"),
        probable: count("probable"),
        switch: count("switch"),
        same: count("same"),
        handled: list.filter((a) => a.handled).length,
        logins: logins.length,
        active_students: active.length,
      },
      accounts: list,
      logins,
    });
  } catch (error) {
    console.error("Devices_Overview:", error.message);
    return res.status(500).json({ message: "تعذّر جلب الأجهزة" });
  }
};

/** body: { PASSWORD, ID? , student_oid? } — كل أجهزة طالب */
export const Devices_Student = async (req, res) => {
  try {
    if (!isPanel(req)) return res.status(401).json({ message: "غير مصرّح" });
    const { ID, student_oid } = req.body || {};
    let student = null;
    if (student_oid) {
      student = await Students.findById(String(student_oid)).select("name ID").lean().catch(() => null);
    } else if (ID !== undefined && String(ID).trim() !== "") {
      const n = Number(String(ID).trim());
      if (!Number.isFinite(n)) return res.status(400).json({ message: "رقم جامعي غير صالح" });
      student = await Students.findOne({ ID: n }).select("name ID").lean();
    } else {
      return res.status(400).json({ message: "الرقم الجامعي مطلوب" });
    }
    if (!student) return res.status(404).json({ message: "لا يوجد طالب بهذا الرقم" });

    const [sessions, alerts, logins] = await Promise.all([
      DeviceSession.find({ student: student._id }).sort({ last_seen: -1 }).limit(300).lean(),
      DeviceAlert.find({ student: student._id, kind: "concurrent" })
        .sort({ last_at: -1 })
        .limit(50)
        .select("level switches reasons overlap_from overlap_to last_at sessions.sid")
        .lean(),
      DeviceAlert.find({ student: student._id, kind: "new_device_login" })
        .sort({ last_at: -1 })
        .limit(50)
        .select("bound_device new_device platform hits last_at")
        .lean(),
    ]);

    const devices = groupDevices(sessions);
    const deviceOf = new Map();
    devices.forEach((d, i) => d.sids.forEach((sid) => deviceOf.set(sid, i)));

    return res.status(200).json({
      student: { _id: student._id, name: student.name, ID: student.ID },
      devices: devices.map(({ login_values, ...d }) => d),
      alerts: alerts.map((a) => ({
        level: a.level,
        category: classify(a),
        switches: a.switches || 1,
        reasons: a.reasons || [],
        overlap_from: a.overlap_from,
        overlap_to: a.overlap_to,
        last_at: a.last_at,
        // رقما الجهازين في القائمة (1 = الأحدث)
        devices: uniq((a.sessions || []).map((s) => deviceOf.get(s.sid)).filter((i) => i !== undefined).map((i) => String(i + 1))),
      })),
      logins,
    });
  } catch (error) {
    console.error("Devices_Student:", error.message);
    return res.status(500).json({ message: "تعذّر جلب أجهزة الطالب" });
  }
};

/** body: { PASSWORD, sids: [..], blocked: true|false } */
export const Devices_Block = async (req, res) => {
  try {
    if (!isPanel(req)) return res.status(401).json({ message: "غير مصرّح" });
    const { sids, blocked } = req.body || {};
    if (
      !Array.isArray(sids) ||
      sids.length === 0 ||
      sids.length > 500 ||
      !sids.every((s) => typeof s === "string" && /^[0-9a-f]{24}$/.test(s)) ||
      typeof blocked !== "boolean"
    ) {
      return res.status(400).json({ message: "طلب غير صالح" });
    }
    const update = blocked
      ? { $set: { blocked: true, blocked_at: new Date() } }
      : { $set: { blocked: false }, $unset: { blocked_at: "" } };
    const r = await DeviceSession.updateMany({ sid: { $in: sids } }, update);
    if (!r.matchedCount) return res.status(404).json({ message: "الجهاز غير موجود" });
    return res.status(200).json({ ok: true, modified: r.modifiedCount });
  } catch (error) {
    console.error("Devices_Block:", error.message);
    return res.status(500).json({ message: "تعذّر تنفيذ الحظر" });
  }
};
