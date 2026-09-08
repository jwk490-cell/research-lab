// Pure adapters. Public site data only; no network, storage, or trading actions.
export const VERSION = 1;
export const finite = v => typeof v === 'number' && Number.isFinite(v);
export const pct = (v, old) => finite(v) && finite(old) && old > 0 ? (v / old - 1) * 100 : null;
export const codeOK = c => /^[0-9A-Z]{6}$/.test(c || '');
export const dateKey = s => String(s || '').replace(/[^0-9]/g, '').slice(0, 8);
export function quarterIndex(q) {
  const m = /^([1-4])Q(\d{2})$/.exec(q || '');
  return m ? (2000 + +m[2]) * 4 + +m[1] - 1 : null;
}
export function reportDate(day, time) {
  const m = /^(\d{2})\/(\d{2})\s/.exec(time || '');
  if (!m) return day;
  let year = +day.slice(0, 4);
  if (`${m[1]}-${m[2]}` > day.slice(5)) year--;
  return `${year}-${m[1]}-${m[2]}`;
}
export function backlogView(row, quarters) {
  if (!row) return null;
  const last = row.v.findLastIndex(finite);
  if (last < 0) return null;
  const q = quarters[last], qi = quarterIndex(q);
  const prev = quarters.findIndex(v => quarterIndex(v) === qi - 1);
  const year = quarters.findIndex(v => quarterIndex(v) === qi - 4);
  return {value:row.v[last], period:q, unit:row.u, currency:row.cur,
    qoq:pct(row.v[last], row.v[prev]), yoy:pct(row.v[last], row.v[year]),
    quality:row.low ? '주의' : row.ver ? '검증' : row.x ? '교차확인' : '미검증',
    series:quarters.map((p,i)=>({p,v:row.v[i]})).slice(Math.max(0,last-7),last+1)};
}
export function utilView(row) {
  if (!row) return null;
  // Latest metadata may explicitly say not_disclosed: do not silently use an older value.
  const periods = [...new Set([...Object.keys(row.series || {}), ...Object.keys(row.meta || {})])].sort();
  const p = periods.at(-1); if (!p) return null;
  const meta = row.meta?.[p] || {}, parts = row.series?.[p] || {};
  const yp = `${+p.slice(0,4)-1}${p.slice(4)}`, prior = row.meta?.[yp];
  const comparable = prior && prior.dur === meta.dur && prior.method === meta.method &&
    JSON.stringify(Object.keys(row.series?.[yp] || {}).sort()) === JSON.stringify(Object.keys(parts).sort());
  return {period:p, value:finite(meta.rep) ? meta.rep : null, duration:meta.dur,
    method:meta.method, receipt:meta.rcept, availability:meta.avail,
    yoy:comparable && finite(meta.rep) && finite(prior.rep) ? meta.rep-prior.rep : null,
    parts:Object.entries(parts).filter(([,v])=>finite(v))};
}
export function buildModel(raw) {
  const stocks = new Map((raw.quotes?.stocks || []).filter(s=>codeOK(s.c)).map(s=>[s.c,{
    code:s.c,name:s.n,market:s.m,sector:s.sec || '',price:s.p,dayChange:s.f,cap:s.v,
    per:s.cper,pbr:s.pbr,high:s.h52,low:s.l52,quoteDate:raw.quotes.updated,
    reports:[],streak:[],streakEvents:[],research:[],highs:[],metrics:{}}]));
  const add = (s,k,v,period,source,unit,extra={}) => {
    if (finite(v)) s.metrics[k] = {v,period,source,unit,...extra};
  };
  for (const s of stocks.values()) {
    add(s,'price',s.price,s.quoteDate,'quotes','원');
    s.ext = raw.ext?.s?.[s.code] || null;
    s.financeDate = raw.ext?.updated;
    for (const f of s.ext?.fin || []) if (f.c === 1)
      add(s,`op${f.y}`,f.op,f.y,'ext','억원',{label:`${f.y}E OP 컨센`});
  }
  for (const day of raw.reports?.days || []) for (const bucket of ['up','down'])
    for (const r of day[bucket] || []) {
      const s = stocks.get(r.code); if (!s) continue;
      const date = reportDate(day.date,r.time);
      const report = {...r,bucket,date,collectionDate:day.date};
      report.id = JSON.stringify([r.code,r.broker,r.title,date,r.time]);
      if (!s.reports.some(v=>v.id===report.id)) s.reports.push(report);
    }
  const dates = Object.keys(raw.streak?.history || {}).sort();
  const latest = dates.at(-1), previous = dates.at(-2);
  for (const cat of raw.streak?.cats || []) {
    const rows = raw.streak.history[latest]?.[cat.key] || [];
    const oldRows = raw.streak.history[previous]?.[cat.key] || [];
    const old = new Set(oldRows.map(r=>r.code)), now = new Set(rows.map(r=>r.code));
    for (const r of rows) stocks.get(r.code)?.streak.push({...r,key:cat.key,label:cat.label});
    if (previous && latest) {
      for (const r of rows) if (!old.has(r.code)) stocks.get(r.code)?.streakEvents.push({label:cat.label,kind:'진입',date:latest,previous});
      for (const r of oldRows) if (!now.has(r.code)) stocks.get(r.code)?.streakEvents.push({label:cat.label,kind:'이탈',date:latest,previous});
    }
    if (latest) for (const s of stocks.values()) s.metrics[`streak_${cat.key}`] = {
      v:now.has(s.code)?1:0,period:latest,source:'streak',unit:'목록',label:`${cat.label} 연속수급 목록`};
  }
  for (const row of raw.backlog?.rows || []) {
    const s = stocks.get(row.c); if (!s) continue;
    s.backlog = backlogView(row,raw.backlog.quarters);
    if (s.backlog) add(s,'backlog',s.backlog.value,s.backlog.period,'backlog',s.backlog.unit,{quality:s.backlog.quality});
  }
  for (const s of stocks.values()) {
    s.util = utilView(raw.util?.[s.code]);
    if (s.util) add(s,'util',s.util.value,s.util.period,'util','%',{method:s.util.method,duration:s.util.duration,
      parts:s.util.parts.map(([k])=>k).sort().join('|')});
    s.reports.sort((a,b)=>b.date.localeCompare(a.date) || String(b.time||'').localeCompare(String(a.time||'')));
    s.streakDate=latest;
  }
  for (const r of raw.research?.items || []) {
    const codes = String(r.ticker || '').match(/[0-9A-Z]{6}/g) || [];
    for (const c of codes) stocks.get(c)?.research.push({name:r.name,file:r.file,date:r.date});
  }
  for (const [key,label] of [['d20','20일'],['d60','60일'],['w52','52주']]) {
    const group = key==='d60' ? raw.highs : raw.highs?.[key];
    for (const r of [...(group?.kospi || []),...(group?.kosdaq || [])])
      stocks.get(r.code)?.highs.push({label,date:raw.highs.base_dt});
  }
  return stocks;
}
export function snapshot(stock, statuses, now=new Date().toISOString()) {
  return {version:VERSION,at:now,metrics:structuredClone(stock.metrics),
    reportIds:stock.reports.map(r=>r.id),reportsKnown:statuses.reports?.ok===true};
}
export function changes(stock, baseline, statuses) {
  if (!baseline || baseline.version!==VERSION) return [];
  const out=[];
  for (const [key,cur] of Object.entries(stock.metrics)) {
    const old=baseline.metrics?.[key];
    if (!old || !statuses[cur.source]?.ok || old.unit!==cur.unit) continue;
    // Data going backwards is not a new event. Preserve zero and null distinctions.
    const order = p => quarterIndex(p) ?? +dateKey(p);
    if (order(cur.period)<order(old.period)) continue;
    if (key==='util' && (cur.method!==old.method || cur.parts!==old.parts)) {
      out.push({key,title:'가동률 집계 구성 변경',before:old,after:cur,kind:'definition'});continue;
    }
    if (key==='backlog' && old.quality!==cur.quality) {
      out.push({key,title:'수주잔고 검증 상태 변경',before:old,after:cur,kind:'definition'});continue;
    }
    if (cur.v===old.v && cur.period===old.period) continue;
    if (cur.v===old.v && !['backlog','util'].includes(key)) continue;
    const title=cur.label || ({price:'가격',backlog:'수주잔고',util:'가동률'}[key] || key);
    out.push({key,title,before:old,after:cur,kind:key.startsWith('streak_')?'membership':'value',
      delta:key==='util' && cur.duration!==old.duration ? null : pct(cur.v,old.v)});
  }
  if (baseline.reportsKnown && statuses.reports?.ok) for (const r of stock.reports)
    if (!baseline.reportIds.includes(r.id)) out.push({key:r.id,title:'새로 관측한 리포트',kind:'report',report:r});
  return out;
}
