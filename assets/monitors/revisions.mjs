import {KEY,readSaved,revisions,filterRevisions,revisionStats,csvCell} from './model.mjs';
import {$,esc,number,signed,tone,readSources,sourceHTML,initTheme} from './common.mjs';
let model={rows:[],years:[],days:[],reports:0},saved=readSaved(null),visible=[],limit=80,loading=false;
function read(){try{saved=readSaved(localStorage.getItem(KEY));}catch(e){saved=readSaved(null);$('notice').textContent='관심종목 저장소를 읽지 못했습니다. 전체 리포트는 볼 수 있습니다.';}}
const percent=v=>v===null?'—':`${signed(v)}%`;
function render(){
  visible=filterRevisions(model.rows,{year:$('year').value,query:$('search').value,broker:$('broker').value,mode:$('mode').value,suspect:$('suspect').checked,watch:$('watch').checked?saved.watch:null});
  const s=revisionStats(visible);
  $('overview').innerHTML=`<div><span>조건 내 종목 · 의심 자료 제외</span><b>${s.stocks}</b></div><div><span>상향 / 하향 관측 건수</span><b><span class="up">${s.up}</span> / <span class="down">${s.down}</span></b></div><div><span>저장 이력으로 비교 가능</span><b>${s.pairs}<small> 쌍</small></b></div>`;
  $('listmeta').textContent=`${visible.length}개 추정 관측 · ${$('year').value||'전체'}E · 최신순${visible.length>limit?` · 처음 ${limit}건 표시`:''}`;
  $('rows').innerHTML=visible.slice(0,limit).map((r,i)=>`<tr class="${r.suspect?'suspect':''}"><td><b>${esc(r.name)}</b><small>${r.code}</small></td><td>${esc(r.date)}<small>${esc(r.broker)} · ${esc(r.analyst||'애널 미상')}</small></td><td class="numbers">${number(r.value)}<small>${r.year}E · 억원</small></td><td class="numbers ${tone(r.direct)}">${percent(r.direct)}<small>보고서 내 변경 전 대비</small></td><td class="numbers ${tone(r.delta)}">${r.transition?esc(r.transition):percent(r.observed)}<small>${r.previous?`${number(r.previous.value)} → ${number(r.value)}억<br>${esc(r.previous.date)} 대비 · ${signed(r.delta)}억`:'동일 증권사·애널 직전 관측 없음'}</small></td><td class="numbers ${tone(r.gap)}">${percent(r.gap)}<small>당시 컨센 ${number(r.cons)}억</small></td><td><details><summary>${esc(r.title||'리포트 상세')}${r.suspect?' · 파싱 확인 필요':''}</summary><p class="meta">수집일 ${esc(r.collected)} · ${esc(r.time)}${r.ambiguous?' · 동일 시각 복수 보고서: 이력 비교 제외':''}</p><p class="meta">${r.direct!==null?'직전대비는 기존 PDF 파서의 변경 전·후 수치에서 계산한 값입니다. 원본 이전 금액은 공개 데이터에 없어 역산하지 않습니다.':'보고서 내 변경 전 수치가 없거나 기존 파서 검증을 통과하지 않아 직전대비가 없습니다.'}</p><button data-history="${i}">이 종목·증권사 이력 보기</button></details></td></tr>`).join('')||'<tr><td colspan="7" class="empty">조건에 맞는 OP 관측이 없습니다. 연도·증권사·관심종목 필터를 확인하세요.</td></tr>';
  $('more').hidden=visible.length<=limit;$('export').disabled=loading||!visible.length;
}
async function load(){if(loading)return;loading=true;$('reload').disabled=true;$('export').disabled=true;$('notice').textContent='OP 추정 이력을 읽고 있습니다…';
  const {raw,statuses}=await readSources(['reports']);
  model=statuses.reports.ok?revisions(raw.reports):{rows:[],years:[],days:[],reports:0};
  const year=$('year').value,broker=$('broker').value;
  $('year').innerHTML=model.years.map(y=>`<option value="${y}">${y}E</option>`).join('');$('year').value=model.years.includes(year)?year:model.years.includes('27')?'27':model.years.at(-1)||'';
  const brokers=[...new Set(model.rows.map(r=>r.broker).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
  $('broker').innerHTML='<option value="">증권사 전체</option>'+brokers.map(b=>`<option value="${esc(b)}">${esc(b)}</option>`).join('');$('broker').value=brokers.includes(broker)?broker:'';
  $('coverage').textContent=model.days.length?`수집 ${model.days[0]} ~ ${model.days.at(-1)} · ${model.days.length}개 수집일 · 중복 제거 리포트 ${model.reports}건 · 발행 갱신 ${raw.reports.updated||'—'}`:'수집 범위를 읽지 못했습니다.';
  $('sources').innerHTML=sourceHTML(raw,statuses);loading=false;$('reload').disabled=false;read();render();
  $('notice').textContent=statuses.reports.ok?'':'리포트 데이터를 읽지 못했습니다. 새로 읽기를 눌러 주세요.';
}
for(const id of ['year','broker','mode','suspect','watch','search'])$(id)[id==='search'?'oninput':'onchange']=()=>{limit=80;render();};
$('rows').onclick=e=>{const b=e.target.closest('[data-history]');if(!b)return;const r=visible[Number(b.dataset.history)];if(!r)return;$('search').value=r.code;$('broker').value=r.broker||'';$('mode').value='all';limit=80;render();};
$('reset').onclick=()=>{$('search').value='';$('broker').value='';$('mode').value='all';$('watch').checked=false;$('suspect').checked=false;limit=80;render();};
$('more').onclick=()=>{limit+=80;render();};$('reload').onclick=load;
$('export').onclick=()=>{
  const head=['종목코드','종목','보고일','수집일','증권사','애널리스트','추정연도','OP억원','보고서내직전대비_pct','직전관측일','직전관측OP억원','관측차액억원','관측변화_pct','전환','당시컨센OP억원','컨센대비_pct','파싱의심','제목'];
  const rows=visible.map(r=>[r.code,r.name,r.date,r.collected,r.broker,r.analyst,'20'+r.year,r.value,r.direct,r.previous?.date,r.previous?.value,r.delta,r.observed,r.transition,r.cons,r.gap,!!r.suspect,r.title]);
  const blob=new Blob(['\uFEFF'+[head,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`OP-revisions-${$('year').value}E.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
window.addEventListener('storage',e=>{if(e.key===KEY||e.key===null){read();render();}});initTheme();read();load();
