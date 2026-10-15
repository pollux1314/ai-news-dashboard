// Hourly-safe refresh: build.py (merges history.json + index.html) -> dedup ingest -> commit & push if changed.
// Usage: npm run refresh   (needs .env.local for Tinybird and GH_TOKEN in env for push)
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const cwd = fileURLToPath(new URL("..", import.meta.url));
const sh = (c, o = {}) => execSync(c, { cwd, stdio: "inherit", ...o });
sh("python3 build.py");
sh("node --env-file=.env.local scripts/ingest.mjs");
sh("git add data.json history.json index.html");
const changed = execSync("git diff --cached --name-only", { cwd }).toString().trim();
if (!changed) { console.log("refresh: no changes, nothing to push"); process.exit(0); }
const ts = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" }).slice(0, 16);
sh(`git commit -q -m "refresh ${ts} UTC+8"`);
sh("git pull -q --rebase origin main");
sh("git push -q origin main");
console.log("refresh: pushed", changed.split("\n").join(", "));
