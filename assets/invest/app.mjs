import {buildModel,changes,snapshot,finite,pct,codeOK,VERSION} from './model.mjs';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,n=0)=>finite(v)?v.toLocaleString('ko-KR',{maximumFractionDigits:n}):'—';
const signed=(v,n=1)=>finite(v)?`${v>0?'+':''}${num(v,n)}`:'—';
const tone=v=>finite(v)?v>0?'up':v<0?'down':'':'';
const fmtdate=s=>/^\d{8}$/.test(s||'')?`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`:s||'기준일 없음';
const qlabel=p=>/^\d{4}\.\d{2}$/.test(p||'')?`${Math.ceil(+p.slice(5)/3)}Q${p.slice(2,4)}`:p;
const KEY='rl-invest-desk-v1';
let saved={version:VERSION,watch:[],baselines:{}}, storageOK=true;
try {const v=JSON.parse(localStorage.getItem(KEY));if(v?.version===VERSION && Array.isArray(v.watch) && v.baselines && typeof v.baselines==='object')saved=v;}catch(e){storageOK=false;}
let raw={},statuses={},stocks=new Map(),selected=new URLSearchParams(location.search).get('code'),filter='all',limit=60,loading=false;
const sources={
  quotes:{path:'data/quotes.json',label:'가격·기본정보',valid:x=>Array.isArray(x.stocks)&&x.stocks.length>0},
  reports:{path:'data/report_screen.json',label:'리포트 스크리너',valid:x=>Array.isArray(x.days)},
  streak:{path:'data/streak.json',label:'연속수급',valid:x=>x.history&&Array.isArray(x.cats)},
  backlog:{path:'data/backlog.json',label:'수주잔고',valid:x=>Array.isArray(x.rows)&&Array.isArray(x.quarters)},
  research:{path:'data/research.json',label:'심층 리서치',valid:x=>Array.isArray(x.items)},
  highs:{path:'data/krhigh.json',label:'신고가',valid:x=>Array.isArray(x.kospi)&&Array.isArray(x.kosdaq)},
  ext:{path:'data/quotes_ext.json',label:'연간 컨센·가격 이력',valid:x=>x.s&&typeof x.s==='object'},
  util:{path:'util/utd.json',label:'가동률',valid:x=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.values(x).some(v=>v.series&&v.meta)}
};
function tell(message){$('notice').textContent=message;}
function save(){try{localStorage.setItem(KEY,JSON.stringify(saved));storageOK=true;return true;}catch(e){storageOK=false;tell('브라우저 저장을 사용할 수 없습니다. 현재 화면은 볼 수 있지만 관심종목과 확인 기준은 보관되지 않습니다.');return false;}}
function safeResearch(file){
  const parts=String(file||'').split('/');
  return parts.length && parts.every(p=>p && p!=='.' && p!=='..' && !/[\\:#?]/.test(p)) ? `research/${parts.map(encodeURIComponent).join('/')}` : null;
}
function link(url,label){return `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)} ↗</a>`;}
function sourceTime(k){const x=raw[k];return x?.base_dt||x?.data_as_of||x?.updated||(k==='research'?x?.items?.[0]?.date:null)||(k==='util'?'기업별 보고기간':null);}
function empty(k,message){return `<p class="empty">${statuses[k]?.ok?message:loading?'불러오는 중…':'데이터를 읽지 못했습니다. 새로 읽기를 눌러 주세요.'}</p>`;}
function sourceLabel(k){return esc(fmtdate(sourceTime(k)));}
function renderSources(){
  $('sources').innerHTML=Object.entries(sources).map(([k,c])=>`<div class="sourcerow"><b>${link(c.path,c.label)}</b><span class="${statuses[k]?.ok?'':'bad'}">${statuses[k]?.ok?sourceLabel(k):loading?'연결 중':'읽기 실패 · 변화 비교 제외'}</span></div>`).join('');
}
function rebuild(){
  stocks=buildModel(raw);
  if(!stocks.has(selected))selected= saved.watch.find(c=>stocks.has(c)) || (stocks.has('005930')?'005930':stocks.keys().next().value);
  render();
}
async function readSource(k){
  const spec=sources[k],ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),20000);
  try{const res=await fetch(`${spec.path}?v=${Math.floor(Date.now()/60000)}`,{cache:'no-cache',signal:ctrl.signal});
    if(!res.ok)throw Error(`HTTP ${res.status}`);const x=await res.json();if(!spec.valid(x))throw Error('schema');
    raw[k]=x;statuses[k]={ok:true};
  }catch(e){delete raw[k];statuses[k]={ok:false};}finally{clearTimeout(timer);}
}
async function load(){
  if(loading)return;loading=true;$('reload').disabled=true;tell('');
  // Core results first; larger finance and DART series load after a usable stock list exists.
  await Promise.all(['quotes','reports','streak','backlog','research','highs'].map(readSource));rebuild();
  await Promise.all(['ext','util'].map(readSource));loading=false;$('reload').disabled=false;rebuild();
  const failed=Object.keys(sources).filter(k=>!statuses[k]?.ok);
  if(failed.length)tell(`${failed.map(k=>sources[k].label).join(' · ')} 연결 실패. 해당 항목은 변화 비교에서 제외했습니다.`);
  else if(!storageOK)tell('브라우저 저장을 사용할 수 없습니다. 관심종목과 확인 기준이 유지되지 않을 수 있습니다.');
}
function render(){renderOverview();renderList();renderDetail();renderSources();}
function delta(s){return changes(s,saved.baselines[s.code],statuses);}
function renderOverview(){
  const tracked=saved.watch.filter(c=>stocks.has(c)),changed=tracked.filter(c=>delta(stocks.get(c)).length);
  $('overview').innerHTML=`<div><span>연결된 종목</span><b>${num(stocks.size)}</b></div><div><span>내 관심종목</span><b>${num(tracked.length)}</b></div><div><span>확인 이후 변화 · 관심종목</span><b>${num(changed.length)}</b></div>`;
}
function renderList(){
  const q=$('search').value.trim().toLowerCase();
  const items=[...stocks.values()].filter(s=>(!q||`${s.name} ${s.code}`.toLowerCase().includes(q)) &&
    (filter!=='watch'||saved.watch.includes(s.code)) && (filter!=='changed'||saved.watch.includes(s.code)&&delta(s).length));
  items.sort((a,b)=>Number(saved.watch.includes(b.code))-Number(saved.watch.includes(a.code)) || (b.cap||0)-(a.cap||0));
  $('listmeta').textContent=`${num(items.length)}종목${filter==='changed'?' · 관심종목 중 변화 있음':''}`;
  $('stocklist').innerHTML=items.slice(0,limit).map(s=>`<button class="stock" data-code="${s.code}" aria-current="${s.code===selected}"><i>${saved.watch.includes(s.code)?'★':''}</i><strong>${esc(s.name)}</strong><span>${s.code} · ${num(s.price)}원 ${delta(s).length?' · 변화 '+delta(s).length+'건':''}</span></button>`).join('') || '<p class="empty">조건에 맞는 종목이 없습니다. 전체 목록에서 관심종목을 추가하세요.</p>';
  $('more').hidden=items.length<=limit;
}
function metric(label,value,note='',cls=''){return `<div class="metric"><span class="label">${esc(label)}</span><strong class="${cls}">${value}</strong><div class="meta">${note}</div></div>`;}
function spark(points){
  if(points.filter(p=>finite(p.v)).length<2)return '';
  const ys=points.filter(p=>finite(p.v)).map(p=>p.v),min=Math.min(...ys),range=Math.max(...ys)-min||1;
  let runs=[],run=[];points.forEach((p,i)=>{if(!finite(p.v)){if(run.length)runs.push(run);run=[];return;}run.push(`${6+i*388/(points.length-1)},${80-(p.v-min)*65/range}`);});if(run.length)runs.push(run);
  return `<svg class="spark" viewBox="0 0 400 92" role="img" aria-label="관측값 추이. 결측 구간은 연결하지 않음">${runs.map(r=>r.length>1?`<polyline points="${r.join(' ')}"/>`:`<circle cx="${r[0].split(',')[0]}" cy="${r[0].split(',')[1]}" r="3"/>`).join('')}</svg><div class="sparktext"><span>${esc(points[0].p)}</span><span>${esc(points.at(-1).p)}</span></div>`;
}
function eventHTML(e){
  if(e.kind==='report')return `<div class="event"><strong>새로 관측한 리포트 ${e.report.suspect?'<span class="tag warn">파싱 확인 필요</span>':''}</strong><p>${esc(e.report.date)} · ${esc(e.report.broker)} · ${esc(e.report.title)}</p></div>`;
  const val=m=>e.kind==='membership'?(m.v?'목록 포함':'목록 미포함'):`${num(m.v,2)}${esc(m.unit)}`;
  return `<div class="event"><strong>${esc(e.title)}</strong><p class="numbers">${val(e.before)} → ${val(e.after)}</p><p>${esc(qlabel(fmtdate(e.before.period)))} → ${esc(qlabel(fmtdate(e.after.period)))}${e.before.period===e.after.period?' · 같은 기준기간 값 변경':''}</p></div>`;
}
function reportHTML(r){
  const years=['26','27','28'].filter(y=>finite(r[`op_${y}e_eok`])||finite(r[`cons_op_${y}`]));
  return `<article class="report"><span class="meta">${esc(r.date)} · ${esc(r.broker)} · ${esc(r.analyst||'')}</span>${r.suspect?'<span class="tag warn">파싱 확인 필요</span>':''}<h4>${esc(r.title)}</h4>${years.length?`<div class="scrolltable"><table><thead><tr><th>영업이익 · 억원</th>${years.map(y=>`<th>${y}E</th>`).join('')}</tr></thead><tbody>${[['추정',y=>num(r[`op_${y}e_eok`],1)],['발행물 비교 컨센',y=>num(r[`cons_op_${y}`],1)],['컨센대비',y=>finite(r[`op_gap_${y}`])?signed(r[`op_gap_${y}`])+'%':'—'],['동 애널 직전대비',y=>finite(r[`op_rev_${y}`])?signed(r[`op_rev_${y}`])+'%':'—']].map(([label,fn])=>`<tr><td>${label}</td>${years.map(y=>`<td>${fn(y)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:'<p class="meta">OP 수치 없음 · EPS/목표가 보조 신호로 포함된 발행물</p>'}</article>`;
}
function renderDetail(){
  const s=stocks.get(selected);if(!s){$('detail').innerHTML='<div class="empty">종목 데이터를 읽지 못했습니다. 데이터 새로 읽기를 눌러 주세요.</div>';return;}
  const b=saved.baselines[s.code],events=delta(s),watch=saved.watch.includes(s.code),bl=s.backlog,u=s.util;
  const ex=s.ext,fin=ex?.fin||[],cons=fin.filter(v=>v.c===1).at(-1);
  $('detail').innerHTML=`
  <div class="stockhead"><div><h2>${esc(s.name)} <span class="meta">${s.code}</span></h2><p class="meta">${s.market==='KS'?'코스피':s.market==='KQ'?'코스닥':esc(s.market)} · ${esc(s.sector)}</p></div><div class="actions"><button id="watch" aria-pressed="${watch}">${watch?'★ 관심종목':'☆ 관심 추가'}</button><button class="primary" id="baseline" ${loading?'disabled':''}>${b?'현재 값으로 확인 완료':'비교 기준 저장'}</button></div></div>
  <div class="metricgrid">${metric('가격',num(s.price)+'<small> 원</small>',`${esc(s.quoteDate)} · <span class="${tone(s.dayChange)}">${signed(s.dayChange)}%</span>`)}${metric('시가총액',s.cap>=10000?num(s.cap/10000,1)+'<small> 조</small>':num(s.cap)+'<small> 억</small>','가격과 같은 발행본 기준')}${metric('1개월 상대수익',finite(ex?.r1)&&finite(raw.ext?.idx?.[s.market]?.r1)?signed(ex.r1-raw.ext.idx[s.market].r1)+'<small> %p</small>':'—',esc(s.financeDate||'자료 없음'))}${metric(`${cons?.y||''}E OP 컨센`,finite(cons?.op)?num(cons.op)+'<small> 억</small>':'—',esc(s.financeDate||'자료 없음'))}</div>
  <div class="baseline">${b?`<b>내 확인 기준</b> ${esc(new Date(b.at).toLocaleString('ko-KR'))} · 변화 ${events.length}건${loading?' · 추가 자료 연결 중':''}`:'<b>첫 확인입니다.</b> ‘비교 기준 저장’을 누르면 다음 방문부터 가격·연간 OP 컨센·수급 목록·수주·가동률·새 리포트를 비교합니다.'}</div>
  <div class="panels">
  <section class="panel wide"><div class="sectionhead"><h3>마지막 확인 이후</h3><span class="meta">데이터별 기준일을 비교합니다</span></div>${b?(events.length?events.slice(0,20).map(eventHTML).join(''):'<p class="empty">비교 가능한 항목에서 변화가 없습니다. 데이터별 연결 상태는 하단에서 확인할 수 있습니다.</p>'):'<p class="empty">아직 비교 기준이 없습니다. 아래에는 원천 데이터의 최근 관측을 표시합니다.</p>'}${events.length>20?`<p class="meta">${events.length}건 중 최근 목록 20건 표시</p>`:''}</section>
  <section class="panel"><div class="sectionhead"><h3>연속수급 · 신고가</h3>${link('index.html#streak','수급 전체')}</div><p class="meta">수급 ${esc(fmtdate(s.streakDate))}</p>${s.streak.length?s.streak.map(r=>`<div class="flowrow"><span>${esc(r.label)} <small>${r.key==='prog'?'KRX+NXT':'KRX'}</small></span><span>${num(r.sum_eok,1)}억 · ${num(r.sum_ratio,3)}%</span></div>`).join(''):empty('streak','해당 기준일 상위 연속수급 목록에 없습니다.')}<p class="reading">${esc(raw.streak?.criteria||'')}</p>${s.streakEvents.map(e=>`<span class="tag">${esc(e.label)} 목록 ${e.kind}</span>`).join('')}${s.streakEvents.length?`<p class="meta">${esc(fmtdate(s.streakEvents[0].previous))} → ${esc(fmtdate(s.streakDate))} · 원천 목록 비교</p>`:''}<p class="reading">${s.highs.length?s.highs.map(h=>`<span class="tag">${h.label} 신고가 · ${esc(fmtdate(h.date))}</span>`).join(''):'신고가 목록: '+(statuses.highs?.ok?'해당 없음':'연결 안 됨')}</p></section>
  <section class="panel"><div class="sectionhead"><h3>가격 흐름</h3>${link(`https://finance.naver.com/item/main.naver?code=${s.code}`,'종목 원문')}</div>${ex?.m?.length?spark(ex.m.slice(-12).map(([p,v])=>({p:`20${p.slice(0,2)}.${p.slice(2)}`,v}))):empty('ext','월별 가격 이력이 없습니다.')}<p class="reading">최근 12개월 월별 종가 · 마지막 달은 진행 중일 수 있습니다.</p><p class="reading">52주 고점대비 <b class="${tone(pct(s.price,s.high))}">${signed(pct(s.price,s.high))}%</b> · 컨센 PER ${num(s.per,2)}배 · PBR ${num(s.pbr,2)}배</p></section>
  <section class="panel wide"><div class="sectionhead"><h3>OP 추정치 · 리포트</h3>${link('reports.html','스크리너 전체')}</div><p class="meta">발행 데이터 ${sourceLabel('reports')} · 최신 5건</p>${s.reports.length?s.reports.slice(0,5).map(reportHTML).join(''):empty('reports','수집된 스크리닝 발행물 중 이 종목의 리포트가 없습니다. 전체 증권사 리포트의 부재를 뜻하지 않습니다.')}</section>
  <section class="panel"><div class="sectionhead"><h3>수주잔고</h3>${link(`backlog.html#${s.code}`,'상세 근거')}</div>${bl?`<span class="tag ${bl.quality==='주의'?'warn':''}">${esc(bl.quality)}</span><h2>${num(bl.value,1)} <small>${esc(bl.unit)} · ${esc(bl.period)}</small></h2><p class="reading">QoQ ${signed(bl.qoq)}% · YoY ${signed(bl.yoy)}%</p>${spark(bl.series)}<details><summary class="meta">분기별 값</summary><div class="scrolltable"><table>${bl.series.map(p=>`<tr><td>${esc(p.p)}</td><td>${num(p.v,1)}</td></tr>`).join('')}</table></div></details>`:empty('backlog','연결된 수주잔고 관측이 없습니다.')}</section>
  <section class="panel"><div class="sectionhead"><h3>가동률</h3>${link(`util/index.html#${s.code}`,'원문·부문 상세')}</div>${u?`<h2>${num(u.value,1)}<small> % · ${esc(qlabel(u.period))}</small></h2><p class="reading">${u.availability==='not_disclosed'?'최신 보고서에 가동률 미공시':`${u.duration||'—'}개월 보고기간 평균 · ${u.method==='avg'?'부문 단순평균':u.method==='total'?'공시 총계':esc(u.method||'대표값')}`}</p><p class="meta">전년 동일 기간·동일 구성 대비 ${signed(u.yoy)}%p</p><div class="scrolltable"><table>${u.parts.slice(0,6).map(([p,v])=>`<tr><td>${esc(p)}</td><td>${num(v,1)}%</td></tr>`).join('')}</table></div>${u.parts.length>6?'<p class="meta">상위 표시 6부문 · 전체는 상세 근거에서 확인</p>':''}${/^\d{14}$/.test(u.receipt||'')?`<p class="reading">${link(`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${u.receipt}`,'DART 해당 보고서')}</p>`:''}`:empty('util','연결된 가동률 관측이 없습니다.')}</section>
  <section class="panel wide"><div class="sectionhead"><h3>연결된 심층 리서치</h3>${link('index.html#deepresearch','리서치 전체')}</div>${s.research.length?s.research.map(r=>safeResearch(r.file)?`<div class="researchlink">${link(safeResearch(r.file),r.name)} <span class="meta">${esc(r.date)}</span></div>`:'').join(''):empty('research','인덱스에 이 종목코드가 명시된 리서치가 없습니다. 테마 자료는 전체 리서치에서 확인하세요.')}</section>
  </div>`;
  $('watch').onclick=()=>{saved.watch=watch?saved.watch.filter(c=>c!==s.code):[...saved.watch,s.code];save();render();};
  $('baseline').onclick=()=>{
    // Keep known baselines for temporarily failed sources, never erase them with missing values.
    const next=snapshot(s,statuses);if(b)for(const [k,v]of Object.entries(b.metrics||{}))if(!statuses[v.source]?.ok)next.metrics[k]=v;
    if(b && !statuses.reports?.ok){next.reportIds=b.reportIds;next.reportsKnown=b.reportsKnown;}
    saved.baselines[s.code]=next;if(!saved.watch.includes(s.code))saved.watch.push(s.code);
    if(save())tell(`${s.name} 확인 기준을 저장했습니다. 다음 관측부터 이 기준과 비교합니다.`);render();
  };
}
$('stocklist').onclick=e=>{const b=e.target.closest('[data-code]');if(!b)return;selected=b.dataset.code;const url=new URL(location.href);url.searchParams.set('code',selected);history.replaceState(null,'',url);renderList();renderDetail();};
$('search').oninput=()=>{limit=60;renderList();};
$('search').onkeydown=e=>{if(e.key==='Enter')$('stocklist').querySelector('button')?.click();};
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;limit=60;document.querySelectorAll('[data-filter]').forEach(v=>v.setAttribute('aria-pressed',String(v===b)));renderList();});
$('more').onclick=()=>{limit+=60;renderList();};$('reload').onclick=load;
function syncTheme(){try{const dark=window.parent!==window?window.parent.document.documentElement.classList.contains('dark'):(localStorage.getItem('rl-theme')||'dark')==='dark';document.documentElement.classList.toggle('dark',dark);}catch(e){}}
$('theme').onclick=()=>{try{const dark=!document.documentElement.classList.contains('dark');localStorage.setItem('rl-theme',dark?'dark':'light');document.documentElement.classList.toggle('dark',dark);}catch(e){document.documentElement.classList.toggle('dark');}};
if(window.parent!==window){$('theme').hidden=true;try{new MutationObserver(syncTheme).observe(window.parent.document.documentElement,{attributes:true,attributeFilter:['class']});}catch(e){}}
window.addEventListener('storage',e=>{if(e.key==='rl-theme')syncTheme();if(e.key===KEY){try{const v=JSON.parse(e.newValue);if(v?.version===VERSION){saved=v;render();}}catch(e){}}});
syncTheme();load();
