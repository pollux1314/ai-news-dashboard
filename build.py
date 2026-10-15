#!/usr/bin/env python3
"""Regenerate index.html from data.json: python3 build.py"""
import json, html, pathlib
d = pathlib.Path(__file__).parent
data = json.loads((d/"data.json").read_text(encoding="utf-8"))
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
.bd.g{color:#7ee2a8}.bd.l{color:#9ec5ff}.why{font-size:13px;color:#a9b3d6;margin:2px 0 6px}
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
ch.innerHTML='<button class="chip on" data-id="all">全部</button>'+D.modules.map(m=>`<button class="chip" data-id="${m.id}">${m.icon} ${esc(m.name)}</button>`).join('');
ch.onclick=e=>{const b=e.target.closest('.chip');if(!b)return;cur=b.dataset.id;[...ch.children].forEach(x=>x.classList.toggle('on',x===b));render()};
const fmt=n=>n>=1e4?(n/1e4).toFixed(1)+'万':n.toLocaleString();
function extra(i){let h='';if(i.stars!=null){h+=`<div><span class="bd">★ ${fmt(i.stars)}</span>`+(i.stars_week?`<span class="bd g">本周 +${fmt(i.stars_week)}</span>`:'')+(i.language?`<span class="bd l">${esc(i.language)}</span>`:'')+'</div>';}
if(i.why)h+=`<div class="why">💡 ${esc(i.why)}</div>`;
if(i.metrics){const m=i.metrics;h+=`<div><span class="bd">❤ ${fmt(m.likes)}</span><span class="bd g">🔁 ${fmt(m.reposts)}</span><span class="bd l">👁 ${fmt(m.views)}</span></div>`}return h}
function render(){const q=document.getElementById('q').value.trim().toLowerCase();let n=0;
document.getElementById('m').innerHTML=D.modules.filter(m=>cur==='all'||m.id===cur).map(m=>{
const its=m.items.filter(i=>!q||(i.title+i.summary+i.source).toLowerCase().includes(q));n+=its.length;if(!its.length)return'';
return `<section class="mod"><h2><span>${m.icon} ${esc(m.name)}</span><span class="tag">${its.length} 条</span></h2>`+its.map(i=>
`<div class="it"><a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.title)}</a><p>${esc(i.summary)}</p>${extra(i)}<span class="tag">${esc(i.source)} · ${esc(i.date)}</span></div>`).join('')+'</section>'}).join('')||'<p class="mu">没有匹配的资讯</p>';
document.getElementById('cnt').textContent=n}
document.getElementById('q').oninput=render;render();
</script></body></html>'''
out = tpl.replace("__T__", html.escape(data.get("title","AI 资讯面板"))).replace("__DATA__", blob)
(d/"index.html").write_text(out, encoding="utf-8")
print("built", sum(len(m["items"]) for m in data["modules"]), "items")
