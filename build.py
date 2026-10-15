#!/usr/bin/env python3
"""Regenerate index.html from data.json: python3 build.py"""
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
data["history"] = hist["items"]
blob = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
tpl = r'''<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>__T__</title><style>
:root{--bg:#0b1020;--card:#151b2e;--line:#26304d;--tx:#e6e9f2;--mu:#8b93ad;--ac:#6ea8fe}
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;background:var(--bg);color:var(--tx)}
header{padding:28px 32px 12px;display:flex;flex-wrap:wrap;gap:16px;align-items:end;justify-content:space-between}
h1{margin:0;font-size:28px}.mu{color:var(--mu);font-size:13px}
.bar{padding:0 32px 16px;display:flex;flex-wrap:wrap;gap:8px}
input{flex:1;min-width:220px;padding:10px 14px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--tx)}
.chip{padding:8px 14px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--tx);cursor:pointer}
.chip.on{background:var(--ac);color:#000;border-color:var(--ac)}
main{padding:0 32px 40px;display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:18px}
.mod{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px}
.mod h2{margin:0 0 10px;font-size:18px;display:flex;justify-content:space-between}
.it{padding:10px 0;border-top:1px solid var(--line)}.it:first-of-type{border-top:0}
.it a{color:var(--tx);text-decoration:none;font-weight:600}.it a:hover{color:var(--ac)}
.it p{margin:6px 0 4px;font-size:14px;line-height:1.55;color:#c5cbe0}
.tag{font-size:12px;color:var(--mu)}
.bd{display:inline-block;font-size:12px;padding:2px 8px;border-radius:999px;margin-right:6px;background:#2a2f45;color:#ffd666}
.bd.g{color:#7ee2a8}.bd.l{color:#9ec5ff}.pager{margin-top:12px;text-align:center}.why{font-size:13px;color:#a9b3d6;margin:2px 0 6px}
</style></head><body>
<header><div><h1>🤖 __T__</h1><div class="mu">每条资讯均附原始来源链接 · 最近约 7 天</div></div>
<div class="mu">最后更新：<b id="up"></b>（UTC+8）· 共 <b id="cnt"></b> 条</div></header>
<div class="bar"><input id="q" placeholder="搜索标题、摘要或来源…"><span id="chips"></span></div>
<main id="m"></main>
<script id="data" type="application/json">__DATA__</script>
<script>
const D=JSON.parse(document.getElementById('data').textContent);let cur='all';
const up=new Date(D.updated);document.getElementById('up').textContent=up.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ch=document.getElementById('chips');
ch.innerHTML='<button class="chip on" data-id="all">本期全部</button><button class="chip" data-id="hist">📚 全部历史 ('+D.history.length+')</button>'+D.modules.map(m=>`<button class="chip" data-id="${m.id}">${m.icon} ${esc(m.name)}</button>`).join('');
ch.onclick=e=>{const b=e.target.closest('.chip');if(!b)return;cur=b.dataset.id;[...ch.children].forEach(x=>x.classList.toggle('on',x===b));render()};
const fmt=n=>n>=1e4?(n/1e4).toFixed(1)+'万':n.toLocaleString();
function extra(i){let h='';if(i.stars!=null){h+=`<div><span class="bd">★ ${fmt(i.stars)}</span>`+(i.stars_week?`<span class="bd g">本周 +${fmt(i.stars_week)}</span>`:'')+(i.language?`<span class="bd l">${esc(i.language)}</span>`:'')+'</div>';}
if(i.why)h+=`<div class="why">💡 ${esc(i.why)}</div>`;
if(i.metrics){const m=i.metrics;h+=`<div><span class="bd">❤ ${fmt(m.likes)}</span><span class="bd g">🔁 ${fmt(m.reposts)}</span><span class="bd l">👁 ${fmt(m.views)}</span></div>`}return h}
let page=1;const PS=20;
const sk=i=>[(i.date||'').length===10?1:0,(i.date||'').length===10?i.date:'',i.first_seen||''];
const cmp=(a,b)=>{const x=sk(a),y=sk(b);for(let k=0;k<3;k++){if(x[k]!==y[k])return x[k]<y[k]?1:-1}return 0};
const card=i=>`<div class="it"><a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.title)}</a><p>${esc(i.summary)}</p>${extra(i)}<span class="tag">${i.module_name?esc(i.module_name)+' · ':''}${esc(i.source)} · ${esc(i.date)}</span></div>`;
function renderHist(q){const all=D.history.filter(i=>!q||(i.title+i.summary+i.source).toLowerCase().includes(q)).sort(cmp);
const pages=Math.max(1,Math.ceil(all.length/PS));if(page>pages)page=pages;const its=all.slice((page-1)*PS,page*PS);
document.getElementById('cnt').textContent=all.length;
document.getElementById('m').innerHTML=`<section class="mod" id="histbox" style="grid-column:1/-1"><h2><span>📚 全部历史（按日期从新到旧）</span><span class="tag">第 ${page}/${pages} 页 · ${all.length} 条</span></h2>`+(its.map(card).join('')||'<p class="mu">没有匹配的资讯</p>')+
`<div class="pager"><button class="chip" onclick="page=Math.max(1,page-1);render()">上一页</button> <button class="chip" onclick="page=page+1;render()">下一页</button></div></section>`}
function render(){if(cur==='hist'){return renderHist(document.getElementById('q').value.trim().toLowerCase())}const q=document.getElementById('q').value.trim().toLowerCase();let n=0;
document.getElementById('m').innerHTML=D.modules.filter(m=>cur==='all'||m.id===cur).map(m=>{
const its=[...m.items].sort(cmp).filter(i=>!q||(i.title+i.summary+i.source).toLowerCase().includes(q));n+=its.length;if(!its.length)return'';
return `<section class="mod"><h2><span>${m.icon} ${esc(m.name)}</span><span class="tag">${its.length} 条</span></h2>`+its.map(i=>
`<div class="it"><a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.title)}</a><p>${esc(i.summary)}</p>${extra(i)}<span class="tag">${esc(i.source)} · ${esc(i.date)}</span></div>`).join('')+'</section>'}).join('')||'<p class="mu">没有匹配的资讯</p>';
document.getElementById('cnt').textContent=n}
document.getElementById('q').oninput=()=>{page=1;render()};render();
</script></body></html>'''
out = tpl.replace("__T__", html.escape(data.get("title","AI 资讯面板"))).replace("__DATA__", blob)
(d/"index.html").write_text(out, encoding="utf-8")
print("built", sum(len(m["items"]) for m in data["modules"]), "items")
