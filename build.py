#!/usr/bin/env python3
"""Local-only: merge data.json into history.json (dedupe context for the hourly refresh). Emits no HTML; the page loads everything from the API."""
import json, html, pathlib
d = pathlib.Path(__file__).parent
data = json.loads((d/"data.json").read_text(encoding="utf-8"))
import hashlib
hp = d/"history.json"
hist = json.loads(hp.read_text(encoding="utf-8")) if hp.exists() else {"items": []}
byid = {h["id"]: h for h in hist["items"]}
for m in data["modules"]:
    for i in m["items"]:
        hid = hashlib.sha1(i["url"].encode()).hexdigest()
        rec = dict(i, id=hid, module=m["id"], module_name=m["name"])
        rec["first_seen"] = byid.get(hid, {}).get("first_seen", data["updated"])
        byid[hid] = rec  # refresh fields (stars etc.), keep first_seen
def skey(i):
    dt = i.get("date", "")
    full = len(dt) == 10
    return (1 if full else 0, dt if full else "", i.get("first_seen", ""))
hist = {"updated": data["updated"], "count": len(byid), "items": sorted(byid.values(), key=skey, reverse=True)}
new_hist = json.dumps(hist, ensure_ascii=False, indent=1)
if not hp.exists() or hp.read_text(encoding="utf-8") != new_hist:
    hp.write_text(new_hist, encoding="utf-8")
for m in data["modules"]:
    m["items"].sort(key=skey, reverse=True)
(d/"data.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
print("history.json:", hist["count"], "items (local only, not committed)")
