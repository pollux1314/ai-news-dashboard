// Dedup ingest: only rows whose id (sha1 of url) is not already in ai_news.
// Usage: node --env-file=.env.local scripts/ingest.mjs
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const base = process.env.TINYBIRD_URL, token = process.env.TINYBIRD_TOKEN;
if (!token || !base) throw new Error("TINYBIRD_TOKEN / TINYBIRD_URL missing");
const auth = { Authorization: `Bearer ${token}` };
const data = JSON.parse(readFileSync(new URL("../data.json", import.meta.url), "utf8"));
const now = new Date().toISOString().slice(0, 19).replace("T", " ");
const pub = s => /^\d{4}-\d{2}-\d{2}$/.test(s || "") ? `${s} 00:00:00` : null;
const q = await fetch(`${base}/v0/sql?q=${encodeURIComponent("SELECT DISTINCT id FROM ai_news FORMAT JSON")}`, { headers: auth });
if (!q.ok) throw new Error(`id query failed ${q.status}: ${await q.text()}`);
const existing = new Set((await q.json()).data.map(r => r.id));
const rows = [], seen = new Set();
for (const m of data.modules) for (const i of m.items) {
  const id = createHash("sha1").update(i.url).digest("hex");
  if (existing.has(id) || seen.has(id)) continue;
  seen.add(id);
  const { title, summary, url, source, date, ...rest } = i;
  rows.push({ id, module: m.id, title, summary: summary || "", url, source: source || "",
    published_at: pub(date), fetched_at: now, extra: JSON.stringify(rest) });
}
if (!rows.length) { console.log(`ingest: 0 new rows (${existing.size} already stored)`); process.exit(0); }
const res = await fetch(`${base}/v0/events?name=ai_news&wait=true`, { method: "POST", headers: auth, body: rows.map(r => JSON.stringify(r)).join("\n") });
const body = await res.text();
if (!res.ok) throw new Error(`ingest failed ${res.status}: ${body}`);
console.log(`ingest: ${rows.length} new rows at ${now} UTC`, body);
