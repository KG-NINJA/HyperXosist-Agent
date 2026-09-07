import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const REPO = 'KG-NINJA/HyperXosist-Agent';
export const ISSUE = 33;
export const ROUTES = Object.freeze(['fix-error','summarize-url','shell-risk-check','agent-visibility-report','hyperxosist-query']);
const ENUMS = {payment:['unpaid_checks_passed','blocked','unknown'], validation:['accepted','rejected','unknown'], index:['active','inactive','not_indexed','unknown'], examples:['complete','incomplete','unknown']};
const SIGNALS = Object.freeze(Object.fromEntries([...ROUTES.flatMap(id=>Object.entries(ENUMS).map(([kind,values])=>[`${id}:${kind}`,values])),['avu',['healthy_prerequisite','degraded','unknown']],['accounting',['available','unknown']]]));
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const keys = (x,expected) => object(x) && Object.keys(x).sort().join('|') === [...expected].sort().join('|');
const count = x => Number.isSafeInteger(x) && x >= 0;
const iso = x => typeof x === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(x) && Number.isFinite(Date.parse(x));
const safeEnum = (v,list) => list.includes(v) ? v : 'unknown';
const MAX = 10n ** 24n;
export function atomic(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,11})(?:\.\d{1,6})?$/.test(value)) return null;
  const [whole,frac=''] = value.split('.');
  return (BigInt(whole)*1000000n + BigInt(frac.padEnd(6,'0'))).toString();
}
export function usdc(value) {
  const n=BigInt(value); return `${n/1000000n}.${(n%1000000n).toString().padStart(6,'0')}`;
}
function validAtomic(x) { return typeof x==='string' && /^(0|[1-9]\d{0,23})$/.test(x) && BigInt(x)<MAX; }
function validMetrics(x) {
  return x===null || keys(x,['matched','amount_atomic','unmatched_receipts','unmatched_onchain','version']) &&
    ['matched','unmatched_receipts','unmatched_onchain'].every(k=>count(x[k])) && validAtomic(x.amount_atomic) &&
    typeof x.version==='string' && /^[A-Za-z0-9_.-]{1,80}$/.test(x.version);
}
export function metrics(observation) {
  const d=observation?.data;
  if (observation?.status!==200 || observation.unavailable || !object(d) || d.stale===true || d.refresh?.ok===false ||
      d.mode!=='mainnet' || d.network!=='eip155:8453') return null;
  const m={matched:d.matched,amount_atomic:atomic(d.confirmed_amount),unmatched_receipts:d.unmatched_receipts,
    unmatched_onchain:d.unmatched_onchain,version:d.reconciliation_version};
  return validMetrics(m) ? m : null;
}
export function snapshot(report,integrity) {
  const signals={};
  for (const id of ROUTES) {
    const row=Array.isArray(report?.routes)?report.routes.find(x=>x?.id===id):null;
    signals[`${id}:payment`]=safeEnum(row?.payment_readiness,ENUMS.payment);
    signals[`${id}:validation`]=safeEnum(row?.official_validation,ENUMS.validation);
    signals[`${id}:index`]=safeEnum(row?.bazaar_index,ENUMS.index);
    const gaps=row?.metadata_gaps;
    signals[`${id}:examples`]=!row || signals[`${id}:payment`]==='unknown' || !Array.isArray(gaps) ? 'unknown' : gaps.length ? 'incomplete' : 'complete';
  }
  const avu=report?.avu;
  signals.avu=avu?.fresh_health_observed!==true?'unknown':avu.health==='ok'&&avu.cost_basis_fresh===true?'healthy_prerequisite':avu.health==='degraded'?'degraded':'unknown';
  const m=metrics(integrity); signals.accounting=m?'available':'unknown';
  const out={version:1,checked_at:report?.checked_at,signals,metrics:m};
  validateSnapshot(out); return out;
}
function validSignals(x) { return keys(x,Object.keys(SIGNALS)) && Object.entries(SIGNALS).every(([k,v])=>v.includes(x[k])); }
export function validateSnapshot(x) {
  if (!keys(x,['version','checked_at','signals','metrics']) || x.version!==1 || !iso(x.checked_at) || !validSignals(x.signals) || !validMetrics(x.metrics) ||
      (x.signals.accounting==='available') !== (x.metrics!==null)) throw new Error('INVALID_MONITOR_OBSERVATION');
}
export function validateState(x) {
  if (x===null) return;
  if (!keys(x,['version','last','signals','pending','high_water','last_metrics']) || x.version!==1 || !iso(x.last) || !validSignals(x.signals) ||
      !keys(x.pending,Object.keys(SIGNALS)) || !Object.values(x.pending).every(v=>Number.isInteger(v)&&v>=0&&v<=2) ||
      !validMetrics(x.last_metrics) || !(x.high_water===null || keys(x.high_water,['matched','amount_atomic'])&&count(x.high_water.matched)&&validAtomic(x.high_water.amount_atomic))) throw new Error('INVALID_MONITOR_STATE');
}
export function transition(previous,current) {
  validateState(previous); validateSnapshot(current);
  if (previous && Date.parse(current.checked_at)<=Date.parse(previous.last)) return {state:previous,events:[],ignored:true};
  const state=previous?structuredClone(previous):{version:1,last:current.checked_at,signals:{...current.signals},pending:Object.fromEntries(Object.keys(SIGNALS).map(k=>[k,0])),high_water:null,last_metrics:null};
  const events=[];
  if (!previous) events.push('初回観測を基準値として保存しました。過去の件数を新規売上に加算しません。');
  else for (const key of Object.keys(SIGNALS)) {
    const next=current.signals[key],old=state.signals[key];
    // Unavailable data is never zero. One transient failure is silent; two are material.
    state.pending[key]=next==='unknown'?Math.min(2,state.pending[key]+1):0;
    if (next===old || next==='unknown'&&state.pending[key]<2) continue;
    state.signals[key]=next;
    events.push(`${key}: ${old} → ${next}`);
  }
  const m=current.metrics, prior=previous?.last_metrics;
  if(m) {
    const hi=state.high_water;
    const versionChanged=prior && prior.version!==m.version;
    if(previous && !hi) events.push('公開照合集計を初めて取得。ここを基準とし、過去分を新規売上にしません。');
    if(versionChanged) events.push('照合方式の版が変更されました。集計差分は履歴再計算の可能性があり、要確認です。');
    else if(hi) {
      const dc=Math.max(0,m.matched-hi.matched), da=BigInt(m.amount_atomic)>BigInt(hi.amount_atomic)?BigInt(m.amount_atomic)-BigInt(hi.amount_atomic):0n;
      if(dc || da) events.push(`要照合：公開の照合済み集計が基準最大値より +${dc}件 / +${usdc(da)} USDC。履歴取込・自己試験を含む可能性があり、外部顧客売上や納品成功は未確定です。`);
    }
    if(prior) {
      if(m.matched<prior.matched || BigInt(m.amount_atomic)<BigInt(prior.amount_atomic)) events.push('照合済み集計が減少しました。再計算・返金・リセット等を確認。基準最大値は保持します。');
      for(const k of ['unmatched_receipts','unmatched_onchain']) if(m[k]>prior[k]) events.push(`要照合：${k} が +${m[k]-prior[k]}。未納品・証跡不足の可能性を調査し、追加支払いはしません。`);
    }
    state.high_water={matched:Math.max(hi?.matched??0,m.matched),amount_atomic:hi&&BigInt(hi.amount_atomic)>BigInt(m.amount_atomic)?hi.amount_atomic:m.amount_atomic};
    state.last_metrics=m;
  }
  state.last=current.checked_at; validateState(state);
  return {state,events,ignored:false};
}
const OPEN='<!-- kg-x402-monitor-state:v1\n',CLOSE='\n-->';
export function readState(body) {
  if(typeof body!=='string' || body.length>60000 || body.split(OPEN).length!==2) throw new Error('MONITOR_ISSUE_MARKER_MISSING');
  const tail=body.split(OPEN)[1],end=tail.indexOf(CLOSE);
  if(end<0)throw new Error('INVALID_MONITOR_STATE');
  const state=JSON.parse(tail.slice(0,end));validateState(state);return state;
}
export function renderState(state,runUrl) {
  validateState(state);
  const rows=ROUTES.map(id=>`| /${id} | ${state.signals[`${id}:payment`]} | ${state.signals[`${id}:validation`]} | ${state.signals[`${id}:index`]} | ${state.signals[`${id}:examples`]} |`).join('\n');
  const m=state.last_metrics;
  return `既存5窓口の監視記録。予定: 03:17 / 09:17 / 15:17 / 21:17 JST（GitHub側で遅延・停止する場合があります）。\n\n最終観測: ${state.last}\n[実行証跡](${runUrl})\n\n| 窓口 | 未払い条件 | 公式検証 | Bazaar | 例示情報 |\n|---|---|---|---|---|\n${rows}\n\nAVU: ${state.signals.avu}（復旧は #34。自動開放しません）。\n照合集計取得: ${state.signals.accounting}。${m?`最後に取得した提供側集計: ${m.matched}件 / ${usdc(m.amount_atomic)} USDC。未照合receipt ${m.unmatched_receipts}件 / 未照合送金 ${m.unmatched_onchain}件。`:'有効な集計なし。0件とはみなしません。'}\n\n状態は取得不能が2回連続した時点でunknownに移行します。変化なしは新規コメントなし。集計差分は外部購入・正常納品・新規売上の独立証明ではありません。個別の決済と納品を別途照合してください。署名・送金・D1・Worker変更は一切行いません。自分自身の実行停止をこのWorkflowだけで検出することはできません。\n\n${OPEN}${JSON.stringify(state)}${CLOSE}`;
}
export function noticeId(previous,events) {
  return createHash('sha256').update(JSON.stringify([previous?.last??null,events])).digest('hex');
}
export async function collect() {
  // Existing fixed-origin probes; no wallet or GitHub token is used in this job.
  const {collectAll,makeReport}=await import('./services-readiness.mjs');
  const observed=await collectAll({validate:true});
  const report=makeReport(observed), observation=snapshot(report,observed.common.integrity);
  await mkdir('audit',{recursive:true});
  await writeFile('audit/revenue-windows.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
  await writeFile('audit/monitor-observation.json',JSON.stringify(observation,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({counts:report.counts,signals:observation.signals,metrics:observation.metrics},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  if(process.argv.slice(2).join(' ')!=='--collect')throw new Error('USE_EXPLICIT_COLLECT');
  collect().catch(()=>{console.error('MONITOR_COLLECTION_FAILED');process.exitCode=1;});
}
