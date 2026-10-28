// Read-only proxy: public dashboard -> Tinybird pipes. The Tinybird token lives only in the Worker secret TINYBIRD_TOKEN.
const PIPES = {
  news_history: ["date_from", "date_to", "module", "keyword", "limit"],
  news_daily_counts: [],
};
const MAX_LIMIT = 200, FETCH_ALL = 5000, TTL = 120;
const RE = {
  module: /^[a-z0-9_-]{0,32}$/,
  date_from: /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/,
  date_to: /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/,
  limit: /^\d{1,4}$/, offset: /^\d{1,5}$/,
};
const mem = new Map(); // per-isolate cache: key -> {t, body}

function cors(env, extra = {}) {
  return { "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN, "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400", Vary: "Origin", ...extra };
}
function json(env, obj, status = 200, cache = true) {
  return new Response(JSON.stringify(obj), { status, headers: cors(env, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": cache && status === 200 ? `public, max-age=${TTL}` : "no-store" }) });
}
function clean(sp, allowed) {
  const out = new URLSearchParams();
  for (const k of allowed) {
    let v = sp.get(k); if (v == null || v === "") continue;
    v = v.trim();
    if (k === "keyword") { if (v.length > 100) throw new Error("keyword too long"); }
    else if (RE[k] && !RE[k].test(v)) throw new Error(`bad ${k}`);
    if (k === "date_from" || k === "date_to") v = v.length === 10 ? v + (k === "date_to" ? " 23:59:59" : " 00:00:00") : v;
    if (k === "limit") v = String(Math.min(Math.max(parseInt(v, 10) || 1, 1), MAX_LIMIT));
    out.set(k, v);
  }
  return out;
}
async function tb(env, pipe, params) {
  const url = `${env.TINYBIRD_URL}/v0/pipes/${pipe}.json?${params}`;
  const hit = mem.get(url);
  if (hit && Date.now() - hit.t < TTL * 1000) return hit.body;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${env.TINYBIRD_TOKEN}` }, cf: { cacheTtl: TTL, cacheEverything: true } });
  if (!r.ok) throw Object.assign(new Error(`upstream ${r.status}`), { status: 502 });
  const body = await r.json();
  if (mem.size > 200) mem.clear();
  mem.set(url, { t: Date.now(), body });
  return body;
}
// GitHub items: older rows embed "GitHub · Lang · ⭐ 1234（10 月 20 日新建）" in source. Move into fields; source -> "GitHub".
function parseStars(v) { const m = String(v).replace(/,/g, "").match(/^([\d.]+)\s*([kK万]?)/); if (!m) return null;
  return Math.round(parseFloat(m[1]) * (m[2] === "万" ? 1e4 : m[2] ? 1e3 : 1)); }
function normGithub(i) {
  if (!/^GitHub\b/.test(i.source || "")) return i;
  const parts = i.source.split("·").map(x => x.trim()).slice(1);
  for (const part of parts) {
    const st = part.match(/^⭐\s*([\d.,]+\s*[kK万]?)\s*(?:[（(]([^）)]*)[）)])?/);
    if (st) { if (i.stars == null) { const n = parseStars(st[1]); if (n != null) i.stars = n; } if (st[2] && !i.note) i.note = st[2]; }
    else if (part && !i.language && part.length <= 20) i.language = part;
  }
  i.source = "GitHub";
  return i;
}
// Deduped (by id), newest-first items from news_history.
async function itemsFor(env, p) {
  p.set("limit", String(FETCH_ALL));
  const rows = (await tb(env, "news_history", p)).data || [];
  const byId = new Map(); let maxF = "";
  for (const r of rows) { // rows are fetched_at DESC: first = latest snapshot; keep earliest fetched_at as first_seen
    if (r.fetched_at > maxF) maxF = r.fetched_at;
    const prev = byId.get(r.id);
    const hasEx = r.extra && r.extra !== "{}" && r.extra.trim() !== "";
    if (!prev) byId.set(r.id, { ...r, extra: hasEx ? r.extra : "{}", first_seen: r.fetched_at });
    else {
      if (r.fetched_at < prev.first_seen) prev.first_seen = r.fetched_at;
      if (hasEx && prev.extra === "{}") prev.extra = r.extra; // rows are newest-first: first non-empty extra = most recent one
    }
  }
  const items = [...byId.values()].map(r => {
    let ex = {}; try { ex = JSON.parse(r.extra || "{}"); } catch {}
    const date = ex.date || (r.published_at ? r.published_at.slice(0, 10) : "");
    const { extra, published_at, ...rest } = r;
    return normGithub({ ...ex, ...rest, date, published_at });
  });
  const k = i => [i.published_at ? 1 : 0, i.published_at || "", i.first_seen || ""];
  items.sort((a, b) => { const x = k(a), y = k(b); for (let j = 0; j < 3; j++) if (x[j] !== y[j]) return x[j] < y[j] ? 1 : -1; return 0; });
  return { items, updated: maxF ? maxF.replace(" ", "T") + "Z" : null }; // fetched_at is UTC
}
function intParam(sp, k, def, max) {
  const v = sp.get(k); if (v != null && v !== "" && !/^\d{1,5}$/.test(v)) throw new Error(`bad ${k}`);
  return Math.min(Math.max(parseInt(v || String(def), 10) || def, 0), max);
}
async function history(env, sp) {
  const p = clean(sp, ["date_from", "date_to", "module", "keyword"]);
  const limit = Math.max(intParam(sp, "limit", 20, MAX_LIMIT), 1), offset = intParam(sp, "offset", 0, 99999);
  const { items, updated } = await itemsFor(env, p);
  return { total: items.length, offset, limit, updated, items: items.slice(offset, offset + limit) };
}
// Newest N items per module for the main view.
async function latest(env, sp) {
  const per = Math.max(intParam(sp, "per", 8, 20), 1);
  const { items, updated } = await itemsFor(env, new URLSearchParams());
  const modules = {}, counts = {};
  for (const i of items) { counts[i.module] = (counts[i.module] || 0) + 1; (modules[i.module] ||= []).length < per && modules[i.module].push(i); }
  return { updated, total: items.length, per, counts, modules };
}
export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(env) });
    if (req.method !== "GET" && req.method !== "HEAD") return json(env, { error: "method not allowed" }, 405, false);
    const u = new URL(req.url);
    try {
      if (u.pathname === "/" ) return json(env, { ok: true, endpoints: ["/latest", "/history", "/pipes/news_history", "/pipes/news_daily_counts"] });
      if (u.pathname === "/history") return json(env, await history(env, u.searchParams));
      if (u.pathname === "/latest") return json(env, await latest(env, u.searchParams));
      const m = u.pathname.match(/^\/pipes\/([a-z_]+?)(\.json)?$/);
      if (!m || !PIPES[m[1]]) return json(env, { error: "not found" }, 404, false);
      const p = clean(u.searchParams, PIPES[m[1]]);
      if (m[1] === "news_history" && !p.has("limit")) p.set("limit", "100");
      const body = await tb(env, m[1], p);
      return json(env, { data: body.data, rows: body.rows });
    } catch (e) {
      return json(env, { error: e.status ? "upstream error" : String(e.message) }, e.status || 400, false);
    }
  },
};
