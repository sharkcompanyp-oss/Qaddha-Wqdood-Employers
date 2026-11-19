import mongoose from "mongoose";
import { isPanel } from "../services/access.js";

// ─── خدمات التشغيل ────────────────────────────────────────────────────────────
// ما تعمل عليه المشاريع كلها في شاشةٍ واحدة:
//   Netlify — موقع الطلاب (EXAMS/frontend) وموقع الأعضاء (employers)
//   Render  — خادم اللوحة (هذا) وخادم الطلاب (EXAMS/backend)
//   MongoDB Atlas — القاعدة المشتركة
//
// المفاتيح في متغيّرات الخادم على Render وحده، ولا تصل الواجهة أبداً:
//   NETLIFY_TOKEN        رمز وصول شخصي (User settings ← Applications)
//   NETLIFY_SITES        اختياري: أسماء المواقع مفصولة بفواصل (بلا ⇒ كل المواقع)
//   RENDER_API_KEY       مفتاح API (Account settings ← API keys)
//   RENDER_SERVICES      اختياري: أسماء الخدمات أو معرّفاتها مفصولة بفواصل
//   ATLAS_CLIENT_ID / ATLAS_CLIENT_SECRET / ATLAS_GROUP_ID
//                        اختياري: حساب خدمة Atlas (Organization ← Access ← Service Accounts)
//                        ومعرّف المشروع — لمعلومات العنقود. حجم القاعدة يُقرأ بدونها.
//
// كل مزوّدٍ يُسأل باستقلال: فشل أحدها (مفتاح ناقص، شبكة) يظهر في بطاقته وحدها.
// النتيجة تُحفظ دقيقة: فتح الشاشة مرّات متتالية لا يستنزف حدود الطلبات.

const TTL_MS = 60 * 1000;
const TIMEOUT_MS = 12000;
let cache = null;

const list = (v) =>
  String(v || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

const monthStart = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
};

/** fetch بمهلة، ورسالة خطأٍ مفهومة بدل استثناء الشبكة الخام */
const getJson = async (url, headers = {}, init = {}) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { headers, signal: ctl.signal, ...init });
    const text = await r.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!r.ok) {
      const msg = body?.message || body?.detail || body?.error || text.slice(0, 140) || r.statusText;
      const e = new Error(`${r.status}: ${msg}`);
      e.status = r.status;
      throw e;
    }
    return body;
  } catch (e) {
    if (e.name === "AbortError") throw new Error(`لم يردّ خلال ${TIMEOUT_MS / 1000} ثانية`);
    throw e;
  } finally {
    clearTimeout(t);
  }
};

/** فحص حيّ: هل يردّ الرابط، وبكم ميلي ثانية */
const ping = async (url) => {
  if (!url) return null;
  const t0 = Date.now();
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { method: "GET", signal: ctl.signal, redirect: "follow" });
    return { ok: r.status < 500, status: r.status, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - t0, error: e.name === "AbortError" ? "مهلة" : "لا ردّ" };
  } finally {
    clearTimeout(t);
  }
};

const settle = async (fn) => {
  try {
    return await fn();
  } catch (e) {
    return { error: e.message || "تعذّر الجلب" };
  }
};

// ─── Netlify ──────────────────────────────────────────────────────────────────
const netlify = async () => {
  const token = process.env.NETLIFY_TOKEN;
  if (!token) return { configured: false, need: ["NETLIFY_TOKEN"] };
  const H = { Authorization: `Bearer ${token}` };
  const API = "https://api.netlify.com/api/v1";

  const all = await getJson(`${API}/sites?filter=all&per_page=100`, H);
  const want = list(process.env.NETLIFY_SITES).map((x) => x.toLowerCase());
  const sites = (all || []).filter(
    (s) => !want.length || want.includes(String(s.name).toLowerCase()) || want.includes(s.id),
  );

  const shaped = await Promise.all(
    sites.map(async (s) => {
      const [deploys, health] = await Promise.all([
        settle(() => getJson(`${API}/sites/${s.id}/deploys?per_page=5`, H)),
        ping(s.ssl_url || s.url),
      ]);
      return {
        id: s.id,
        name: s.name,
        url: s.ssl_url || s.url,
        custom_domain: s.custom_domain || "",
        admin_url: s.admin_url,
        account_slug: s.account_slug,
        account_name: s.account_name,
        repo: s.build_settings?.repo_url || "",
        branch: s.build_settings?.repo_branch || "",
        health,
        deploys: Array.isArray(deploys)
          ? deploys.map((d) => ({
              state: d.state,
              title: d.title || "",
              branch: d.branch || "",
              context: d.context || "",
              commit_ref: d.commit_ref || "",
              created_at: d.created_at,
              published_at: d.published_at,
              error_message: d.error_message || "",
            }))
          : [],
        deploys_error: deploys?.error || null,
      };
    }),
  );

  // استهلاك الفريق — مساراتٌ غير موثّقة رسمياً: تُجرَّب، وإن رُفضت قيل ذلك
  const slug = sites[0]?.account_slug;
  let usage = null;
  if (slug) {
    const [bw, builds] = await Promise.all([
      settle(() => getJson(`${API}/accounts/${slug}/bandwidth`, H)),
      settle(() => getJson(`${API}/${slug}/builds/status`, H)),
    ]);
    const b = Array.isArray(builds) ? builds[0] : builds;
    usage = {
      bandwidth: bw?.error
        ? { error: bw.error }
        : bw
          ? {
              used_bytes: bw.used ?? null,
              included_bytes: bw.included ?? null,
              period_start: bw.period_start_date || null,
              period_end: bw.period_end_date || null,
              updated_at: bw.last_updated_at || null,
            }
          : null,
      build_minutes: b?.error
        ? { error: b.error }
        : b?.minutes
          ? {
              used: b.minutes.current ?? null,
              included: b.minutes.included_minutes ?? null,
              period_start: b.minutes.period_start_date || null,
              period_end: b.minutes.period_end_date || null,
            }
          : null,
    };
  }

  return {
    configured: true,
    filtered: want.length > 0,
    sites: shaped,
    usage,
    unmatched: want.filter((w) => !sites.some((s) => String(s.name).toLowerCase() === w || s.id === w)),
  };
};

// ─── Render ───────────────────────────────────────────────────────────────────
const render = async () => {
  const key = process.env.RENDER_API_KEY;
  if (!key) return { configured: false, need: ["RENDER_API_KEY"] };
  const H = { Authorization: `Bearer ${key}`, Accept: "application/json" };
  const API = "https://api.render.com/v1";

  const rows = await getJson(`${API}/services?limit=100`, H);
  const want = list(process.env.RENDER_SERVICES).map((x) => x.toLowerCase());
  const services = (rows || [])
    .map((r) => r.service)
    .filter(Boolean)
    .filter(
      (s) => !want.length || want.includes(String(s.name).toLowerCase()) || want.includes(String(s.id).toLowerCase()),
    );

  const from = monthStart().toISOString();
  const to = new Date().toISOString();

  const shaped = await Promise.all(
    services.map(async (s) => {
      const url = s.serviceDetails?.url || "";
      const [deploys, bw, health] = await Promise.all([
        settle(() => getJson(`${API}/services/${s.id}/deploys?limit=5`, H)),
        settle(() =>
          getJson(
            `${API}/metrics/bandwidth?resource=${encodeURIComponent(s.id)}&startTime=${encodeURIComponent(from)}&endTime=${encodeURIComponent(to)}`,
            H,
          ),
        ),
        ping(url),
      ]);
      // سلسلة زمنية لقيم الفترات — مجموعها استهلاك الشهر حتى الآن
      let bandwidth = null;
      if (Array.isArray(bw)) {
        const vals = bw.flatMap((series) => series.values || []);
        bandwidth = {
          total: vals.reduce((n, v) => n + (Number(v.value) || 0), 0),
          unit: bw[0]?.unit || "GB",
          points: vals.length,
        };
      } else if (bw?.error) bandwidth = { error: bw.error };

      return {
        id: s.id,
        name: s.name,
        type: s.type,
        plan: s.serviceDetails?.plan || "",
        region: s.serviceDetails?.region || "",
        runtime: s.serviceDetails?.runtime || s.serviceDetails?.env || "",
        instances: s.serviceDetails?.numInstances ?? null,
        url,
        dashboard_url: s.dashboardUrl,
        suspended: s.suspended === "suspended",
        suspenders: s.suspenders || [],
        branch: s.branch || "",
        repo: s.repo || "",
        auto_deploy: s.autoDeploy === "yes",
        updated_at: s.updatedAt,
        health,
        bandwidth,
        deploys: Array.isArray(deploys)
          ? deploys
              .map((d) => d.deploy || d)
              .map((d) => ({
                status: d.status,
                trigger: d.trigger || "",
                commit: d.commit?.message ? String(d.commit.message).split("\n")[0] : "",
                commit_id: d.commit?.id ? String(d.commit.id).slice(0, 7) : "",
                created_at: d.createdAt,
                finished_at: d.finishedAt || null,
              }))
          : [],
        deploys_error: deploys?.error || null,
      };
    }),
  );

  return {
    configured: true,
    filtered: want.length > 0,
    services: shaped,
    month_from: from,
    unmatched: want.filter(
      (w) => !services.some((s) => String(s.name).toLowerCase() === w || String(s.id).toLowerCase() === w),
    ),
  };
};

// ─── MongoDB ──────────────────────────────────────────────────────────────────
// الحجم من القاعدة نفسها (dbStats) — دقيقٌ ولا يحتاج مفتاحاً. معلومات العنقود
// (الباقة، الإصدار، المنطقة) من Atlas Admin API إن وُجد حساب خدمة.
const TIER_LIMIT_MB = { M0: 512, M2: 2048, M5: 5120 };

const atlasCluster = async () => {
  const id = process.env.ATLAS_CLIENT_ID;
  const secret = process.env.ATLAS_CLIENT_SECRET;
  const group = process.env.ATLAS_GROUP_ID;
  if (!id || !secret || !group) return { configured: false, need: ["ATLAS_CLIENT_ID", "ATLAS_CLIENT_SECRET", "ATLAS_GROUP_ID"] };
  const tok = await getJson(
    "https://cloud.mongodb.com/api/oauth/token",
    {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    { method: "POST", body: "grant_type=client_credentials" },
  );
  const r = await getJson(`https://cloud.mongodb.com/api/atlas/v2/groups/${group}/clusters`, {
    Authorization: `Bearer ${tok.access_token}`,
    Accept: "application/vnd.atlas.2023-02-01+json",
  });
  // الحقول متداخلة بحسب نسخة الواجهة — نقرأ الشكلين
  const clusters = (r?.results || []).map((c) => {
    const rc = c.replicationSpecs?.[0]?.regionConfigs?.[0];
    const tier = c.providerSettings?.instanceSizeName || rc?.electableSpecs?.instanceSize || "";
    return {
      name: c.name,
      tier,
      provider: rc?.backingProviderName || rc?.providerName || c.providerSettings?.backingProviderName || "",
      region: rc?.regionName || c.providerSettings?.regionName || "",
      version: c.mongoDBVersion || "",
      state: c.stateName || "",
      paused: !!c.paused,
      disk_gb: c.diskSizeGB ?? null,
      limit_mb: TIER_LIMIT_MB[tier] ?? (c.diskSizeGB ? c.diskSizeGB * 1024 : null),
    };
  });
  return { configured: true, clusters };
};

const mongo = async () => {
  const db = mongoose.connection.db;
  if (!db) throw new Error("لا اتصال بالقاعدة");
  const [stats, cols, atlas] = await Promise.all([
    db.stats(),
    db.listCollections({}, { nameOnly: true }).toArray(),
    settle(atlasCluster),
  ]);
  // حجم كل مجموعة — الأكبر أولاً؛ ما يرفضه الخادم المشترك يُعدّ بلا حجم
  const collections = await Promise.all(
    cols.map(async ({ name }) => {
      try {
        const s = await db.command({ collStats: name });
        return { name, count: s.count, size: s.size, storage: s.storageSize, indexes: s.totalIndexSize };
      } catch {
        try {
          return { name, count: await db.collection(name).estimatedDocumentCount() };
        } catch {
          return { name };
        }
      }
    }),
  );
  collections.sort((a, b) => (b.storage || b.size || 0) - (a.storage || a.size || 0));
  return {
    name: db.databaseName,
    data_bytes: stats.dataSize,
    storage_bytes: stats.storageSize,
    index_bytes: stats.indexSize,
    objects: stats.objects,
    collections_count: stats.collections,
    collections,
    atlas,
  };
};

export const Ops_Overview = async (req, res) => {
  try {
    if (!isPanel(req)) return res.status(401).json({ message: "غير مصرّح" });
    const fresh = req.body?.fresh === true;
    if (!fresh && cache && Date.now() - cache.at < TTL_MS) {
      return res.status(200).json({ ...cache.data, cached: true });
    }
    const [n, r, m] = await Promise.all([settle(netlify), settle(render), settle(mongo)]);
    const data = { netlify: n, render: r, mongo: m, generated_at: new Date() };
    cache = { at: Date.now(), data };
    return res.status(200).json({ ...data, cached: false });
  } catch (err) {
    console.error("Ops_Overview:", err);
    return res.status(500).json({ message: "تعذّر جلب خدمات التشغيل" });
  }
};
