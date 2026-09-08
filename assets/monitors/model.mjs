import {finite,codeOK,reportDate,changes,snapshot,VERSION} from '../invest/model.mjs';
export const KEY='rl-invest-desk-v1';
export function readSaved(text){
  const v=JSON.parse(text||'null');
  if(v?.version!==VERSION)return {version:VERSION,watch:[],baselines:{}};
  return {version:VERSION,watch:[...new Set((Array.isArray(v.watch)?v.watch:[]).filter(codeOK))],
    baselines:Object.fromEntries(Object.entries(v.baselines||{}).filter(([c,b])=>codeOK(c)&&b?.version===VERSION&&b.metrics&&Array.isArray(b.reportIds)))};
}
export function acknowledge(saved,stock,statuses){
  const b=saved.baselines[stock.code], next=snapshot(stock,statuses);
  if(b)for(const [k,v]of Object.entries(b.metrics||{}))if(!statuses[v.source]?.ok)next.metrics[k]=v;
  if(b&&!statuses.reports?.ok){next.reportIds=b.reportIds;next.reportsKnown=b.reportsKnown;}
  return {...saved,watch:[...new Set([...saved.watch,stock.code])],baselines:{...saved.baselines,[stock.code]:next}};
}
export function eventSource(e){return e.kind==='report'?'reports':e.after?.source;}
export function monitorRows(stocks,saved,statuses){
  return saved.watch.map(code=>{const stock=stocks.get(code),baseline=saved.baselines[code];return {code,stock,baseline,events:stock?changes(stock,baseline,statuses):[]};});
}
// A series is one company, house, named analyst and fiscal year. No cross-house pairing.
export function revisions(data){
  const seen=new Map();
  for(const day of [...(data.days||[])].sort((a,b)=>a.date.localeCompare(b.date)))for(const r of [...(day.up||[]),...(day.down||[])]){
    if(!codeOK(r.code))continue;
    const date=reportDate(day.date,r.time),time=/(\d{2}:\d{2})$/.exec(r.time||'')?.[1]||'';
    const id=JSON.stringify([r.code,r.broker,r.analyst,r.title,date,time]);
    seen.set(id,{...r,id,date,time,collected:day.date,stamp:date+' '+time});
  }
  const reports=[...seen.values()].sort((a,b)=>a.stamp.localeCompare(b.stamp)||a.id.localeCompare(b.id));
  const stampKey=r=>JSON.stringify([r.code,r.broker?.trim(),r.analyst?.trim(),r.stamp]), stampCounts=new Map();
  for(const r of reports){const k=stampKey(r);stampCounts.set(k,(stampCounts.get(k)||0)+1);}
  const years=[...new Set(reports.flatMap(r=>Object.keys(r).flatMap(k=>/^op_(\d{2})e_eok$/.exec(k)?.slice(1)||[])))].sort();
  const rows=[],series=new Map();
  for(const r of reports)for(const y of years){
    const value=r[`op_${y}e_eok`],direct=r[`op_rev_${y}`],cons=r[`cons_op_${y}`];
    if(!finite(value)&&!finite(direct))continue;
    const key=JSON.stringify([r.code,r.broker?.trim(),r.analyst?.trim(),y]);
    const history=series.get(key)||[];
    // A missing analyst, ambiguous timestamp or suspect parse cannot establish a comparable pair.
    const prior=history.at(-1);
    const sameStamp=stampCounts.get(stampKey(r))>1;
    const previous= r.broker?.trim()&&r.analyst?.trim()&&prior&&!prior.ambiguous&&!sameStamp&&!r.suspect&&!prior.suspect&&prior.stamp<r.stamp ? prior:null;
    const delta=previous&&finite(value)?value-previous.value:null;
    const observed=finite(delta)&&previous.value>0?delta/previous.value*100:null;
    const transition=previous&&finite(value)?previous.value<=0&&value>0?'흑자 전환':previous.value>=0&&value<0?'적자 전환':previous.value<0&&value<0?(delta>0?'적자 축소':delta<0?'적자 확대':'적자 유지'):previous.value===0?'직전 0 · 금액 비교':'':'';
    const gap=finite(value)&&finite(cons)&&cons!==0?(value-cons)/Math.abs(cons)*100:null;
    const row={...r,year:y,value:finite(value)?value:null,direct:finite(direct)?direct:null,cons:finite(cons)?cons:null,gap,previous,delta,observed,transition,ambiguous:sameStamp};
    rows.push(row);if(finite(value)){history.push({value,date:r.date,stamp:r.stamp,suspect:r.suspect,ambiguous:sameStamp});series.set(key,history);}
  }
  return {rows:rows.reverse(),years,reports:reports.length,days:[...new Set((data.days||[]).map(d=>d.date))].sort()};
}
export function filterRevisions(rows,{year,query='',broker='',mode='all',suspect=false,watch=null}={}){
  const q=query.trim().toLowerCase();
  return rows.filter(r=>(!year||r.year===year)&&(!broker||r.broker===broker)&&(!q||`${r.name} ${r.code} ${r.analyst} ${r.title}`.toLowerCase().includes(q))&&(suspect||!r.suspect)&&(!watch||watch.includes(r.code))&&
    (mode==='all'||mode==='direct'&&finite(r.direct)||mode==='observed'&&finite(r.delta)||mode==='up'&&(r.direct??r.observed)>0||mode==='down'&&(r.direct??r.observed)<0));
}
export function revisionStats(rows){const valid=rows.filter(r=>!r.suspect);return {stocks:new Set(valid.map(r=>r.code)).size,up:valid.filter(r=>(r.direct??r.observed)>0).length,down:valid.filter(r=>(r.direct??r.observed)<0).length,pairs:valid.filter(r=>finite(r.delta)).length};}
export function csvCell(v){let s=String(v??'');if(/^[\s]*[=+@-]/.test(s)&&typeof v!=='number')s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
