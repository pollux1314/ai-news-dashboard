// Usage: node --env-file=.env.local scripts/ingest.mjs
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createTinybirdApi } from "@tinybirdco/sdk";
const base = process.env.TINYBIRD_URL, token = process.env.TINYBIRD_TOKEN;
if (!token) throw new Error("TINYBIRD_TOKEN missing");
const data = JSON.parse(readFileSync(new URL("../data.json", import.meta.url), "utf8"));
const fmt = d => d.toISOString().slice(0, 19).replace("T", " ");
const now = fmt(new Date());
const pub = s => /^\d{4}-\d{2}-\d{2}$/.test(s || "") ? `${s} 00:00:00` : null;
const rows = [];
for (const m of data.modules) for (const i of m.items) {
  const { title, summary, url, source, date, ...rest } = i;
  rows.push({ id: createHash("sha1").update(url).digest("hex"), module: m.id, title, summary: summary || "",
    url, source: source || "", published_at: pub(date), fetched_at: now, extra: JSON.stringify(rest) });
}
const res = await fetch(`${base}/v0/events?name=ai_news&wait=true`, {
  method: "POST", headers: { Authorization: `Bearer ${token}` },
  body: rows.map(r => JSON.stringify(r)).join("\n"),
});
const body = await res.text();
if (!res.ok) throw new Error(`ingest failed ${res.status}: ${body}`);
console.log(`ingested ${rows.length} rows at ${now} UTC`, body);
