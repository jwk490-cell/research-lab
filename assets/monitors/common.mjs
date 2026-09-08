export const $=id=>document.getElementById(id);
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const number=(v,n=1)=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('ko-KR',{maximumFractionDigits:n}):'—';
export const signed=v=>typeof v==='number'&&Number.isFinite(v)?`${v>0?'+':''}${number(v)}`:'—';
export const tone=v=>v>0?'up':v<0?'down':'';
export const labels={quotes:'가격',ext:'연간 OP 컨센',reports:'새 리포트',streak:'수급 목록',backlog:'수주잔고',util:'가동률'};
export const specs={quotes:['data/quotes.json',x=>Array.isArray(x.stocks)&&x.stocks.length>0],ext:['data/quotes_ext.json',x=>x.s&&typeof x.s==='object'],reports:['data/report_screen.json',x=>Array.isArray(x.days)],streak:['data/streak.json',x=>x.history&&Array.isArray(x.cats)],backlog:['data/backlog.json',x=>Array.isArray(x.rows)&&Array.isArray(x.quarters)],util:['util/utd.json',x=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.values(x).some(v=>v.series&&v.meta)]};
export async function readSources(keys){
  const raw={},statuses={};
  await Promise.all(keys.map(async k=>{const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),20000);
    try{const r=await fetch(`${specs[k][0]}?v=${Math.floor(Date.now()/60000)}`,{cache:'no-cache',signal:ctrl.signal});if(!r.ok)throw Error('HTTP '+r.status);const data=await r.json();if(!specs[k][1](data))throw Error('schema');raw[k]=data;statuses[k]={ok:true};}catch(e){statuses[k]={ok:false};}finally{clearTimeout(timer);}
  }));return {raw,statuses};
}
export function sourceHTML(raw,statuses){return Object.keys(statuses).map(k=>`<div class="sourcerow"><a href="${specs[k][0]}" target="_blank" rel="noopener">${labels[k]}</a><span>${statuses[k].ok?esc(raw[k].updated||raw[k].base_dt||'기업별 보고기간'):'읽기 실패 · 비교 제외'}</span></div>`).join('');}
export function initTheme(){
  function sync(){try{document.documentElement.classList.toggle('dark',window.parent!==window?window.parent.document.documentElement.classList.contains('dark'):(localStorage.getItem('rl-theme')||'dark')==='dark');}catch(e){}}
  $('theme').onclick=()=>{const dark=!document.documentElement.classList.contains('dark');document.documentElement.classList.toggle('dark',dark);try{localStorage.setItem('rl-theme',dark?'dark':'light');}catch(e){}};
  if(window.parent!==window){$('theme').hidden=true;try{new MutationObserver(sync).observe(window.parent.document.documentElement,{attributes:true,attributeFilter:['class']});}catch(e){}}
  window.addEventListener('storage',e=>{if(e.key==='rl-theme')sync();});sync();
}
