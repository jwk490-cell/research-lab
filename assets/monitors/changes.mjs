import {buildModel} from '../invest/model.mjs';
import {KEY,readSaved,acknowledge,monitorRows,eventSource} from './model.mjs';
import {$,esc,number,labels,readSources,sourceHTML,initTheme} from './common.mjs';
let saved,storageOK=true,stocks=new Map(),raw={},statuses={},loading=false;
function read(){try{saved=readSaved(localStorage.getItem(KEY));storageOK=true;}catch(e){saved||=readSaved(null);storageOK=false;}}
function commit(change){read();if(!storageOK){$('notice').textContent='저장소를 읽지 못했습니다. 관심종목·기준을 저장할 수 없습니다.';return false;}const next=change(saved);try{localStorage.setItem(KEY,JSON.stringify(next));saved=next;return true;}catch(e){$('notice').textContent='브라우저 저장 공간을 사용할 수 없습니다. 기준을 저장하지 못했습니다.';return false;}}
function value(m,e){return e.kind==='membership'?(m.v?'목록 포함':'목록 미포함'):`${number(m.v,2)} ${esc(m.unit)}`;}
function event(e){
  if(e.kind==='report')return `<div class="event"><span class="tag">새 리포트</span><strong>${esc(e.report.title)}</strong><p>${esc(e.report.date)} · ${esc(e.report.broker)} · ${esc(e.report.analyst)}${e.report.suspect?' · 파싱 확인 필요':''}</p></div>`;
  return `<div class="event"><span class="tag">${labels[eventSource(e)]||'변화'}</span><strong>${esc(e.title)}</strong><p class="numbers">${value(e.before,e)} <span class="arrow">→</span> ${value(e.after,e)}</p><p>${esc(e.before.period)} → ${esc(e.after.period)}${e.kind==='definition'?' · 집계 정의/검증 상태 변경':''}</p></div>`;
}
function render(){
  const rows=monitorRows(stocks,saved,statuses),changed=rows.filter(r=>r.events.length),missing=rows.filter(r=>!r.baseline);
  $('overview').innerHTML=`<div><span>내 관심종목</span><b>${rows.length}</b></div><div><span>확인 이후 변화가 있는 종목</span><b>${changed.length}</b></div><div><span>비교 기준 미저장</span><b>${missing.length}</b></div>`;
  const query=$('search').value.trim().toLowerCase(),kind=$('kind').value,scope=$('scope').value;
  const visible=rows.map(r=>({...r,filtered:r.events.filter(e=>!kind||eventSource(e)===kind)})).filter(r=>(!query||`${r.stock?.name||''} ${r.code}`.toLowerCase().includes(query))&&(!kind||r.filtered.length)&&(scope!=='changed'||r.filtered.length));
  visible.sort((a,b)=>b.filtered.length-a.filtered.length||(a.stock?.name||a.code).localeCompare(b.stock?.name||b.code,'ko'));
  $('listmeta').textContent=`${visible.length}종목 · ${visible.reduce((n,r)=>n+r.filtered.length,0)}개 변화${kind?' · 선택 유형만 표시':''}`;
  $('feed').innerHTML=visible.map(r=>`<article class="monitorcard"><div class="sectionhead"><div><h2>${esc(r.stock?.name||r.code)} <small>${r.code}</small></h2><p class="meta">${r.baseline?'내 확인 기준 '+esc(new Date(r.baseline.at).toLocaleString('ko-KR')):'비교 기준을 저장하면 다음 관측부터 비교합니다.'}</p></div><div class="actions"><a href="invest.html?code=${r.code}" target="_blank" rel="noopener">투자 카드 ↗</a><button data-ack="${r.code}" ${loading||!r.stock?'disabled':''}>${r.baseline?'이 종목 전체 확인 완료':'현재 값으로 기준 저장'}</button><button data-remove="${r.code}" aria-label="${esc(r.stock?.name||r.code)} 관심 해제">관심 해제</button></div></div>${r.filtered.length?r.filtered.map(event).join(''):`<p class="empty">${!r.stock?'종목 원천을 읽지 못했거나 현재 종목 목록에 없습니다. 기존 기준을 보존합니다.':!r.baseline?'아직 비교 기준이 없습니다.':loading?'데이터를 읽고 있습니다…':'비교 가능한 항목에서 변화가 없습니다.'}</p>`}</article>`).join('')||`<div class="empty panel">${!rows.length?'관심종목을 먼저 추가하세요. 투자 카드에서 저장한 관심종목도 여기에 표시됩니다.':'선택 조건에 맞는 변화가 없습니다. ‘관심종목 전체’에서 확인 기준을 관리할 수 있습니다.'}</div>`;
  renderSearch();$('sources').innerHTML=sourceHTML(raw,statuses);
}
function renderSearch(){
  const q=$('addsearch').value.trim().toLowerCase();
  const found=q?[...stocks.values()].filter(s=>`${s.name} ${s.code}`.toLowerCase().includes(q)).slice(0,12):[];
  $('candidates').innerHTML=found.map(s=>`<button data-add="${s.code}" ${saved.watch.includes(s.code)?'disabled':''}>${esc(s.name)} <small>${s.code}</small> ${saved.watch.includes(s.code)?'추가됨':'+ 관심 추가'}</button>`).join('')||(q?'<span class="meta">검색 결과가 없습니다.</span>':'');
}
async function load(){
  if(loading)return;loading=true;$('reload').disabled=true;$('notice').textContent='데이터를 읽고 있습니다…';render();
  ({raw,statuses}=await readSources(['quotes','reports','ext','streak','backlog','util']));stocks=buildModel(raw);loading=false;$('reload').disabled=false;read();render();
  const failed=Object.keys(statuses).filter(k=>!statuses[k].ok);$('notice').textContent=failed.length?`${failed.map(k=>labels[k]).join(' · ')} 읽기 실패. 해당 데이터는 변화 비교에서 제외하고 기존 확인 기준을 보존합니다.`:storageOK?'':'저장소를 사용할 수 없습니다. 관심종목과 기준을 보관할 수 없습니다.';
}
$('feed').onclick=e=>{const ack=e.target.closest('[data-ack]'),remove=e.target.closest('[data-remove]');
  if(ack&&!loading){const s=stocks.get(ack.dataset.ack);if(s&&commit(v=>acknowledge(v,s,statuses))){$('notice').textContent=`${s.name}의 모든 비교 가능한 항목을 확인 완료했습니다. 읽기 실패 항목의 기존 기준은 유지합니다.`;render();}}
  if(remove){commit(v=>({...v,watch:v.watch.filter(c=>c!==remove.dataset.remove)}));render();}
};
$('candidates').onclick=e=>{const b=e.target.closest('[data-add]');if(!b||!stocks.has(b.dataset.add))return;commit(v=>({...v,watch:[...new Set([...v.watch,b.dataset.add])]}));render();};
$('addsearch').oninput=renderSearch;for(const id of ['search','kind','scope'])$(id)[id==='search'?'oninput':'onchange']=render;
$('reload').onclick=load;
window.addEventListener('storage',e=>{if(e.key===KEY||e.key===null){read();render();}});
read();initTheme();load();
