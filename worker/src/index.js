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
// Deduped, newest-first, paginated history built from news_history.
async function history(env, sp) {
  const p = clean(sp, ["date_from", "date_to", "module", "keyword"]);
  if (sp.get("limit") && !RE.limit.test(sp.get("limit"))) throw new Error("bad limit");
  if (sp.get("offset") && !RE.offset.test(sp.get("offset"))) throw new Error("bad offset");
  const limit = Math.min(Math.max(parseInt(sp.get("limit") || "20", 10) || 20, 1), MAX_LIMIT);
  const offset = Math.max(parseInt(sp.get("offset") || "0", 10) || 0, 0);
  p.set("limit", String(FETCH_ALL));
  const rows = (await tb(env, "news_history", p)).data || [];
  const byId = new Map();
  for (const r of rows) { // rows are fetched_at DESC: first = latest snapshot; keep earliest fetched_at as first_seen
    const prev = byId.get(r.id);
    if (!prev) byId.set(r.id, { ...r, first_seen: r.fetched_at });
    else prev.first_seen = r.fetched_at;
  }
  const items = [...byId.values()].map(r => {
    let ex = {}; try { ex = JSON.parse(r.extra || "{}"); } catch {}
    const date = ex.date || (r.published_at ? r.published_at.slice(0, 10) : "");
    const { extra, published_at, ...rest } = r;
    return { ...ex, ...rest, date, published_at };
  });
  const k = i => [i.published_at ? 1 : 0, i.published_at || "", i.first_seen || ""];
  items.sort((a, b) => { const x = k(a), y = k(b); for (let j = 0; j < 3; j++) if (x[j] !== y[j]) return x[j] < y[j] ? 1 : -1; return 0; });
  return { total: items.length, offset, limit, items: items.slice(offset, offset + limit) };
}
export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(env) });
    if (req.method !== "GET" && req.method !== "HEAD") return json(env, { error: "method not allowed" }, 405, false);
    const u = new URL(req.url);
    try {
      if (u.pathname === "/" ) return json(env, { ok: true, endpoints: ["/history", "/pipes/news_history", "/pipes/news_daily_counts"] });
      if (u.pathname === "/history") return json(env, await history(env, u.searchParams));
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
