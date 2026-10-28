// Hourly refresh (local + Tinybird only; NEVER commits or pushes — the public page reads everything from the API).
// 1) build.py: merge data.json into local history.json   2) deduped ingest (by id vs Tinybird)   3) sync local history.json with Tinybird
// Usage: npm run refresh   (needs .env.local)
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const cwd = fileURLToPath(new URL("..", import.meta.url));
const sh = c => execSync(c, { cwd, stdio: "inherit" });
sh("python3 build.py");
sh("node --env-file=.env.local scripts/ingest.mjs");
sh("node --env-file=.env.local scripts/sync-history.mjs");
console.log("refresh: done (Tinybird updated; nothing committed — page is live from the API within ~2 min)");
