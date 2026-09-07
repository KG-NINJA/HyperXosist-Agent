import test from 'node:test';
import assert from 'node:assert/strict';
import {atomic,snapshot,transition,readState,renderState,noticeId,validateSnapshot,ROUTES,REPO,ISSUE} from '../scripts/revenue-monitor.mjs';
import {publish} from '../scripts/publish-revenue-monitor.mjs';
const T='2026-09-07T09:30:00.000Z';
const plus=(h)=>new Date(Date.parse(T)+h*3600000).toISOString();
const copy=x=>structuredClone(x);
function sample(h=0){
 const report={checked_at:plus(h),routes:ROUTES.map(id=>({id,payment_readiness:'unpaid_checks_passed',official_validation:'accepted',bazaar_index:id==='fix-error'?'active':'not_indexed',metadata_gaps:[]})),avu:{fresh_health_observed:true,health:'degraded',cost_basis_fresh:false}};
 const integrity={status:200,data:{mode:'mainnet',network:'eip155:8453',matched:15,confirmed_amount:'0.15',unmatched_receipts:49,unmatched_onchain:0,reconciliation_version:'2026-07-26-v2'}};
 return {report,integrity};
}
function obs(h=0){const s=sample(h);return snapshot(s.report,s.integrity);}
const initial=()=>transition(null,obs()).state;
const run='https://github.com/'+REPO+'/actions/runs/123';
test('strict decimal units, no float/exponent/negative/rounding',()=>{
 assert.equal(atomic('0.15'),'150000');assert.equal(atomic('0.000001'),'1');assert.equal(atomic('320'),'320000000');
 for(const v of [0.15,'1e-2','-1','0.0000001','01','NaN'])assert.equal(atomic(v),null);
});
test('initial historical counts are baseline, never new customer sales',()=>{
 const x=transition(null,obs());assert.equal(x.events.length,1);assert.match(x.events[0],/初回観測/);assert.equal(x.state.high_water.amount_atomic,'150000');
});
test('no change advances checkpoint without another comment',()=>{
 const x=transition(initial(),obs(6));assert.deepEqual(x.events,[]);assert.equal(x.state.last,plus(6));
});
test('one transient unknown is silent; two unknowns then recovery are material',()=>{
 const a=obs(6);a.signals['fix-error:payment']='unknown';
 const x=transition(initial(),a);assert.equal(x.events.length,0);assert.equal(x.state.signals['fix-error:payment'],'unpaid_checks_passed');
 a.checked_at=plus(12);const y=transition(x.state,a);assert.equal(y.events.length,1);assert.equal(y.state.signals['fix-error:payment'],'unknown');
 const z=transition(y.state,obs(18));assert.equal(z.events.length,1);assert.match(z.events[0],/unknown → unpaid_checks_passed/);
});
test('explicit payment regression and new index are immediate',()=>{
 const a=obs(6);a.signals['shell-risk-check:payment']='blocked';a.signals['hyperxosist-query:index']='active';
 const x=transition(initial(),a);assert.equal(x.events.length,2);
});
test('positive counters only create a reconciliation candidate',()=>{
 const a=obs(6);a.metrics.matched=16;a.metrics.amount_atomic='160000';
 const x=transition(initial(),a);assert.equal(x.events.length,1);assert.match(x.events[0],/要照合/);assert.match(x.events[0],/外部顧客売上や納品成功は未確定/);
});
test('a lower counter and rebound cannot manufacture a second revenue increment',()=>{
 const a=obs(6);a.metrics.matched=0;a.metrics.amount_atomic='0';const x=transition(initial(),a);
 assert.equal(x.state.high_water.matched,15);assert.match(x.events[0],/減少/);
 const y=transition(x.state,obs(12));assert.deepEqual(y.events,[]);
});
test('unknown accounting preserves last counters and returns without false increment',()=>{
 const a=obs(6);a.metrics=null;a.signals.accounting='unknown';
 const x=transition(initial(),a);assert.equal(x.state.last_metrics.matched,15);assert.equal(x.events.length,0);
 a.checked_at=plus(12);const y=transition(x.state,a);assert.equal(y.events.length,1);
 const z=transition(y.state,obs(18));assert.equal(z.events.length,1);assert.doesNotMatch(z.events[0],/\+15/);
});
test('accounting version change is not labelled as new sales',()=>{
 const a=obs(6);a.metrics.version='v3';a.metrics.matched=25;a.metrics.amount_atomic='250000';
 const x=transition(initial(),a);assert.equal(x.events.length,1);assert.match(x.events[0],/履歴再計算/);
});
test('fresh new unmatched counts alert but initial 49 does not',()=>{
 const a=obs(6);a.metrics.unmatched_receipts=50;const x=transition(initial(),a);assert.equal(x.events.length,1);assert.match(x.events[0],/\+1/);
});
test('stale or wrong-network metrics are unknown, never zero',()=>{
 for(const d of [{stale:true},{refresh:{ok:false}},{network:'eip155:84532'},{confirmed_amount:'NaN'},{reconciliation_version:'<script>'}]){
  const s=sample();Object.assign(s.integrity.data,d);assert.equal(snapshot(s.report,s.integrity).metrics,null);
 }
});
test('snapshot retains only fixed statuses and approved aggregates',()=>{
 const s=sample();s.integrity.data.wallet='SECRET';s.report.routes[0].description='@everyone SECRET';
 assert.doesNotMatch(JSON.stringify(snapshot(s.report,s.integrity)),/SECRET/);
});
test('AVU health-only recovery is not an automatic release',()=>{
 const s=sample(6);s.report.avu={fresh_health_observed:true,health:'ok',cost_basis_fresh:true};
 const x=transition(initial(),snapshot(s.report,s.integrity));assert.equal(x.events.length,1);assert.match(x.events[0],/healthy_prerequisite/);
});
test('older or same observation is idempotently ignored',()=>{
 for(const h of [-1,0])assert.equal(transition(initial(),obs(h)).ignored,true);
});
test('corrupt, missing and injected state fail closed',()=>{
 assert.deepEqual(readState(renderState(initial(),run)),initial());
 for(const b of ['', '<!-- kg-x402-monitor-state:v1\n{}\n-->', renderState(initial(),run)+'<!-- kg-x402-monitor-state:v1\nnull\n-->'])assert.throws(()=>readState(b));
 const a=obs();a.signals['fix-error:index']='@everyone';assert.throws(()=>validateSnapshot(a));
});
test('notice id is stable across retry of same transition',()=>{
 assert.equal(noticeId(initial(),['change']),noticeId(initial(),['change']));assert.notEqual(noticeId(initial(),['a']),noticeId(initial(),['b']));
});
const env={GITHUB_REPOSITORY:REPO,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',GITHUB_RUN_ID:'123',GH_TOKEN:'TEST_ONLY_NOT_A_SECRET'};
function transport(body,comments=[]){
 const calls=[];
 return {calls,fetchImpl:async(url,options)=>{
  calls.push({url,options});assert.equal(new URL(url).hostname,'api.github.com');assert.equal(options.redirect,'error');
  const data=options.method==='GET'?url.includes('/comments?')?comments:{number:ISSUE,state:'open',body}:{};
  return new Response(JSON.stringify(data),{status:200});
 }};
}
test('publisher refuses PRs, foreign repos, nonmain or stale artifacts before network',async()=>{
 for(const patch of [{GITHUB_EVENT_NAME:'pull_request'},{GITHUB_REF:'refs/heads/other'},{GITHUB_REPOSITORY:'other/repo'}, {GH_TOKEN:''}]){
  const f=transport('');await assert.rejects(publish(obs(),{env:{...env,...patch},fetchImpl:f.fetchImpl,now:Date.parse(T)}));assert.equal(f.calls.length,0);
 }
 const f=transport('');await assert.rejects(publish(obs(),{env,fetchImpl:f.fetchImpl,now:Date.parse(T)+7200000}));assert.equal(f.calls.length,0);
});
test('baseline creates one notice and writes state only to Issue 33',async()=>{
 const f=transport('<!-- kg-x402-monitor-state:v1\nnull\n-->');
 const r=await publish(obs(),{env,fetchImpl:f.fetchImpl,now:Date.parse(T)});
 assert.equal(r.notified,true);assert.equal(f.calls.filter(c=>c.options.method==='POST').length,1);
 assert.ok(f.calls.every(c=>new URL(c.url).pathname.startsWith(`/repos/${REPO}/issues/33`)));
});
test('unchanged snapshot updates body but never posts another comment',async()=>{
 const f=transport(renderState(initial(),run));const r=await publish(obs(6),{env,fetchImpl:f.fetchImpl,now:Date.parse(plus(6))});
 assert.equal(r.notified,false);assert.equal(f.calls.length,2);assert.equal(f.calls[1].options.method,'PATCH');
});
test('retry after comment success/state-write failure deduplicates its notice',async()=>{
 const events=transition(initial(),{...obs(6),signals:{...obs(6).signals,'fix-error:index':'not_indexed'}}).events;
 const comments=[{user:{login:'github-actions[bot]'},body:`<!-- kg-x402-notice:${noticeId(initial(),events)} -->`}];
 const f=transport(renderState(initial(),run),comments);const a=obs(6);a.signals['fix-error:index']='not_indexed';
 const r=await publish(a,{env,fetchImpl:f.fetchImpl,now:Date.parse(plus(6))});assert.equal(r.notified,false);assert.equal(f.calls.filter(c=>c.options.method==='POST').length,0);
});
test('closed issue is a deliberate stop, not silently reopened',async()=>{
 await assert.rejects(publish(obs(),{env,now:Date.parse(T),fetchImpl:async()=>new Response(JSON.stringify({number:33,state:'closed'}))}),/NOT_OPEN/);
});
