#!/usr/bin/env bash
# Deploy via Cloudflare API (box Node is too old for wrangler). Needs CLOUDFLARE_API_TOKEN in env.
# Optional: TB_JWT_FILE=path to set/rotate the TINYBIRD_TOKEN secret (scoped read-only JWT).
set -euo pipefail
cd "$(dirname "$0")"
A=c2b6399bfb0491d9111f777e2fa1b2fb; S=ai-news-proxy; API=https://api.cloudflare.com/client/v4/accounts/$A/workers
H="Authorization: Bearer $CLOUDFLARE_API_TOKEN"
META='{"main_module":"index.js","compatibility_date":"2026-10-01","keep_bindings":["secret_text"],"bindings":[{"type":"plain_text","name":"TINYBIRD_URL","text":"https://api.us-east.aws.tinybird.co"},{"type":"plain_text","name":"ALLOWED_ORIGIN","text":"https://pollux1314.github.io"}]}'
curl -sf -X PUT -H "$H" "$API/scripts/$S" -F "metadata=$META;type=application/json" -F "index.js=@src/index.js;type=application/javascript+module" -o /dev/null && echo "script uploaded"
curl -sf -X POST -H "$H" -H "Content-Type: application/json" "$API/scripts/$S/subdomain" -d '{"enabled":true}' -o /dev/null && echo "workers.dev enabled"
if [ -n "${TB_JWT_FILE:-}" ]; then
  python3 -c 'import json,sys;print(json.dumps({"name":"TINYBIRD_TOKEN","type":"secret_text","text":open(sys.argv[1]).read().strip()}))' "$TB_JWT_FILE" \
  | curl -sf -X PUT -H "$H" -H "Content-Type: application/json" "$API/scripts/$S/secrets" --data-binary @- -o /dev/null && echo "secret set"
fi
