// One-off backfill: github items whose Tinybird `extra` is empty get a new row with real {stars, language}
// from the GitHub REST API (no stars_week invented). Same id/module/title/summary/url/source/published_at, fetched_at = now.
// Usage: GH_TOKEN=... node --env-file=.env.local scripts/backfill-extra.mjs [--dry]
const base = process.env.TINYBIRD_URL, token = process.env.TINYBIRD_TOKEN, gh = process.env.GH_TOKEN;
if (!token || !base) throw new Error("TINYBIRD_TOKEN / TINYBIRD_URL missing");
const dry = process.argv.includes("--dry");
const auth = { Authorization: `Bearer ${token}` };
const sql = `SELECT id, any(module) AS m, any(title) AS t, any(summary) AS s, any(url) AS u, any(source) AS src,
  any(published_at) AS pub, countIf(extra NOT IN ('', '{}')) AS has_extra
  FROM ai_news WHERE module = 'github' GROUP BY id HAVING has_extra = 0 FORMAT JSON`;
const q = await fetch(`${base}/v0/sql?q=${encodeURIComponent(sql)}`, { headers: auth });
if (!q.ok) throw new Error(`query failed ${q.status}: ${(await q.text()).slice(0, 300)}`);
const todo = (await q.json()).data.map(x => ({ id: x.id, module: x.m, title: x.t, summary: x.s, url: x.u, source: x.src, published_at: x.pub }));
console.log(`github items with empty extra: ${todo.length}`);
const now = new Date().toISOString().slice(0, 19).replace("T", " ");
const rows = [], skipped = [];
for (const r of todo) {
  const m = r.url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/#?]+)/i);
  if (!m) { skipped.push(`${r.url} (not a repo URL)`); continue; }
  const res = await fetch(`https://api.github.com/repos/${m[1]}/${m[2].replace(/\.git$/, "")}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "ai-news-backfill", ...(gh ? { Authorization: `Bearer ${gh}` } : {}) } });
  if (!res.ok) { skipped.push(`${r.url} (HTTP ${res.status})`); continue; }
  const j = await res.json();
  const extra = { stars: j.stargazers_count };
  if (j.language) extra.language = j.language;
  rows.push({ id: r.id, module: r.module, title: r.title, summary: r.summary, url: r.url, source: r.source,
    published_at: r.published_at, fetched_at: now, extra: JSON.stringify(extra) });
}
console.log(`filled: ${rows.length}, skipped: ${skipped.length}`); skipped.forEach(s => console.log("  skip", s));
if (dry || !rows.length) process.exit(0);
const res = await fetch(`${base}/v0/events?name=ai_news&wait=true`, { method: "POST", headers: auth, body: rows.map(x => JSON.stringify(x)).join("\n") });
if (!res.ok) throw new Error(`ingest failed ${res.status}: ${await res.text()}`);
console.log(`backfill: inserted ${rows.length} rows at ${now} UTC`, await res.text());
