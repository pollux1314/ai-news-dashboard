// Local-only: union every item stored in Tinybird into history.json so "already collected" checks see the full archive.
// Usage: node --env-file=.env.local scripts/sync-history.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const base = process.env.TINYBIRD_URL, token = process.env.TINYBIRD_TOKEN;
if (!token || !base) throw new Error("TINYBIRD_TOKEN / TINYBIRD_URL missing");
const hp = new URL("../history.json", import.meta.url);
const r = await fetch(`${base}/v0/pipes/news_history.json?limit=100000`, { headers: { Authorization: `Bearer ${token}` } });
if (!r.ok) throw new Error(`news_history failed ${r.status}`);
const rows = (await r.json()).data;
const hist = existsSync(hp) ? JSON.parse(readFileSync(hp, "utf8")) : { items: [] };
const byId = new Map(hist.items.map(i => [i.id, i]));
let added = 0;
for (const x of rows.reverse()) { // oldest snapshot first
  if (byId.has(x.id)) continue;
  let ex = {}; try { ex = JSON.parse(x.extra || "{}"); } catch {}
  byId.set(x.id, { ...ex, title: x.title, url: x.url, source: x.source, summary: x.summary,
    date: ex.date || (x.published_at || "").slice(0, 10), id: x.id, module: x.module,
    first_seen: x.fetched_at.replace(" ", "T") + "Z" });
  added++;
}
const items = [...byId.values()].sort((a, b) => ((b.date || "") + (b.first_seen || "")).localeCompare((a.date || "") + (a.first_seen || "")));
writeFileSync(hp, JSON.stringify({ updated: new Date().toISOString(), count: items.length, items }, null, 1));
console.log(`sync-history: ${items.length} items locally (${added} added from Tinybird, ${rows.length} Tinybird rows)`);
