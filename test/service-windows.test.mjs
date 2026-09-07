import test from 'node:test';
import assert from 'node:assert/strict';
import {offers,getOffer,readServiceResult,matchesPinnedSchema} from '../service-receipts.mjs';
import {validTerms,decodeChallenge,normalizeSchema,contractMatches,validValidation,evaluateRoute,collectAll,makeReport,main,URLS} from '../scripts/services-readiness.mjs';
const copy=x=>structuredClone(x);
const p=offers.payment_policy;
const terms={scheme:'exact',network:p.network,amount:p.amount,asset:p.asset,payTo:p.payTo,maxTimeoutSeconds:300};
const receipt={root_cause:'Example only',next_command:'npm install',retry_plan:['Review first'],risk_note:'No execution',prevention_note:'Check lockfile',generated_at:'2026-09-07T00:00:00Z'};
const example={
 'fix-error':{status:'paid',service:'Agent Error Fix Receipt',version:'test',mode:'mainnet',network:p.network,real_revenue:false,input_received:true,request_id:'synthetic',revenue_proof_log:'test',durable_revenue_log:true,post_payment_retry_path:'reconcile',receipt},
 'summarize-url':{status:'paid',summary:'Example excerpt',title:'Example Domain',url:'https://example.com'},
 'shell-risk-check':{status:'paid',risk_level:'low',explanation:'Example',safer_alternative:'Review first'},
 'agent-visibility-report':{report_type:'agent_visibility_report',generated_at:'2026-09-07T00:00:00Z',agent_visibility_score:80,payment_readiness_score:40,machine_discovery_score:50,detected_gaps:['example'],matched_real_world_patterns:['example'],recommended_next_fix:{action:'inspect'},privacy:{aggregation_only:true}},
 'hyperxosist-query':{status:'paid',service:'HyperXosist Query Builder',query:'example',searchUrl:'https://x.com/search?q=example',mode:'live',appliedNoiseTerms:[],excludeTerms:[],generated_at:'2026-09-07T00:00:00Z',version:'test',payment:{protocol:'x402',paid:true,price:'$0.01',network:p.network,real_revenue:false}}
};
const validation={valid:true,statusCode:402,x402Version:2,simulation:{outcome:'accepted'},preflight:['reachable','returns_402','has_bazaar_extension','parse'].map(check=>({check,passed:true,severity:'required'})),index:{active:true}};
function fixture(spec){
 const ch={x402Version:2,resource:{url:spec.resource},accepts:[copy(terms)],extensions:{bazaar:{info:{input:{type:'http',method:'POST',bodyType:'json',body:spec.example_request},output:{type:'json',example:example[spec.id]}},schema:{type:'object'}}}};
 const api={paths:{['/'+spec.id]:{post:{'x-payment-info':{protocol:'x402',version:2,scheme:'exact',price:'$0.01',network:p.network,payTo:p.payTo,bazaar_indexing:{asset_contract:p.asset}},requestBody:{content:{'application/json':{schema:spec.request_schema,example:spec.example_request}}},responses:{'200':{content:{'application/json':{schema:spec.response_schema,example:example[spec.id]}}}}}}}};
 return copy({common:{openapi:{status:200,data:api},catalog:{status:200,data:{offers:[{id:spec.id,endpoint:spec.resource,method:'POST',price:{atomic_amount:'10000',network:p.network},payment:{recipient:p.payTo}}]}},discovery:{status:200,data:{resources:[{resource:spec.resource,x402Version:2,accepts:[terms],metadata:{output:{example:example[spec.id]}}}]}}},own:{challenge:{status:402,data:{payment_required:ch},payment_required:Buffer.from(JSON.stringify(ch)).toString('base64')},validator:{status:200,data:validation}}});
}
test('five fixed mainnet windows and excluded systems are explicit',()=>{
 assert.deepEqual(offers.services.map(x=>x.id),['fix-error','summarize-url','shell-risk-check','agent-visibility-report','hyperxosist-query']);
 assert.equal(p.automatic_purchase,false);assert.equal(offers.excluded.length,3);assert.throws(()=>getOffer('avu'));
 assert.throws(()=>{offers.payment_policy.amount='1';});
});
for(const spec of offers.services){
 test(spec.id+': useful explicit input and capped instruction, never executed',()=>{
  assert.equal(matchesPinnedSchema(spec.example_request,spec.request_schema),true);
  assert.equal(spec.paid_cli_example.run_automatically,false);
  const a=spec.paid_cli_example.argv;assert.equal(a[a.indexOf('--max-amount')+1],'10000');
  assert.deepEqual(JSON.parse(a[a.indexOf('--data')+1]),spec.example_request);
  assert.ok(spec.free_alternative&&spec.limitations);
 });
 test(spec.id+': parse raw result without changing evidence',()=>{
  const raw=copy(example[spec.id]), original=copy(raw), result=readServiceResult(spec.id,raw);
  assert.deepEqual(raw,original);assert.deepEqual(result,spec.diagnostic_path?raw.receipt:raw);
 });
 test(spec.id+': missing required fields and wrong types fail',()=>{
  for(const field of spec.response_schema.required){const raw=copy(example[spec.id]);delete raw[field];assert.throws(()=>readServiceResult(spec.id,raw));}
  for(const raw of [null,false,0,[],{response:example[spec.id]}])assert.throws(()=>readServiceResult(spec.id,raw));
 });
 test(spec.id+': complete fixture validates without paying',()=>{
  const f=fixture(spec),r=evaluateRoute(spec,f.common,f.own);
  assert.equal(r.payment_readiness,'unpaid_checks_passed');assert.equal(r.official_validation,'accepted');assert.equal(r.bazaar_index,'active');assert.deepEqual(r.metadata_gaps,[]);assert.equal(r.paid_delivery_verified,false);
 });
 test(spec.id+': live schema drift blocks even when example is unchanged',()=>{
  const f=fixture(spec);f.common.openapi.data.paths['/'+spec.id].post.responses['200'].content['application/json'].schema.properties.generated_at={type:'number'};
  assert.equal(evaluateRoute(spec,f.common,f.own).payment_readiness,'blocked');
 });
}
test('metadata annotations do not hide validation changes',()=>{
 const a={type:'object',properties:{description:{type:'string',description:'annotation'}},additionalProperties:false};
 const b={type:'object',properties:{description:{type:'string'}},required:[],additionalProperties:false};
 assert.equal(contractMatches(a,b,{}),true);a.properties.description.type='number';assert.equal(contractMatches(a,b,{}),false);
});
test('external or recursive schema references are refused',()=>{
 for(const ref of ['https://evil.invalid/schema','#/components/schemas/Loop'])assert.throws(()=>normalizeSchema({$ref:ref},{components:{schemas:{Loop:{$ref:ref}}}}));
});
test('local refs resolve and extra schema constraints are not silently ignored',()=>{
 assert.deepEqual(normalizeSchema({$ref:'#/components/schemas/X'},{components:{schemas:{X:{type:'string'}}}}),{type:'string'});
 assert.equal(contractMatches({type:'string',maxLength:1},{type:'string'},{}),false);
});
for(const value of [null,false,0,'',[],{},'text']){
 test('invalid challenge is blocked: '+JSON.stringify(value),()=>{
  const spec=getOffer('shell-risk-check'),f=fixture(spec);f.own.challenge.payment_required=Buffer.from(JSON.stringify(value)).toString('base64');
  assert.equal(evaluateRoute(spec,f.common,f.own).payment_readiness,'blocked');
 });
}
for(const [key,value] of [['amount','1'],['network','eip155:84532'],['asset','0x'+'1'.repeat(40)],['payTo','0x'+'2'.repeat(40)],['scheme','upto']]){
 test('changed financial terms never follow remote metadata: '+key,()=>{
  assert.equal(validTerms({...terms,[key]:value}),false);
  const s=getOffer('fix-error'),f=fixture(s),ch=copy(f.own.challenge.data.payment_required);ch.accepts[0][key]=value;
  f.own.challenge.payment_required=Buffer.from(JSON.stringify(ch)).toString('base64');f.own.challenge.data.payment_required=ch;
  assert.equal(evaluateRoute(s,f.common,f.own).payment_readiness,'blocked');
 });
}
test('unavailable validator and explicit unindexed route stay distinct',()=>{
 const s=getOffer('fix-error'),f=fixture(s);f.own.validator={unavailable:true};
 assert.equal(evaluateRoute(s,f.common,f.own).bazaar_index,'unknown');
 f.own.validator={status:200,data:{...validation,index:null}};assert.equal(evaluateRoute(s,f.common,f.own).bazaar_index,'not_indexed');
 f.own.validator.data.index={active:false};assert.equal(evaluateRoute(s,f.common,f.own).bazaar_index,'inactive');
});
test('validator cannot pass with missing mandatory checks or failed checks',()=>{
 for(const v of [null,{}, {...validation,preflight:[]},{...validation,preflight:[{check:'reachable',passed:true,severity:'required'}]}, {...validation,simulation:{outcome:'rejected'}}])assert.equal(validValidation(v),false);
 const v=copy(validation);v.preflight[0].passed=false;assert.equal(validValidation(v),false);
});
test('incomplete discovery example is reported without inventing paid failure',()=>{
 const s=getOffer('agent-visibility-report'),f=fixture(s);f.common.openapi.data.paths['/'+s.id].post.responses['200'].content['application/json'].example=copy(example[s.id]);delete f.common.openapi.data.paths['/'+s.id].post.responses['200'].content['application/json'].example.generated_at;
 const r=evaluateRoute(s,f.common,f.own);assert.equal(r.payment_readiness,'unpaid_checks_passed',JSON.stringify(r));assert.ok(r.metadata_gaps.includes('openapi_output_example_missing_or_incomplete'));
});
test('null metadata never bypasses required checks',()=>{
 const s=getOffer('fix-error');for(const value of [null,[],false,0,''])for(const key of ['openapi','catalog']){
  const f=fixture(s);f.common[key].data=value;assert.equal(evaluateRoute(s,f.common,f.own).payment_readiness,'blocked');
 }
});
test('result parser refuses demo flags, unsafe URLs, unbounded and cyclic data',()=>{
 const x=copy(example['hyperxosist-query']);x.payment.demo=true;assert.throws(()=>readServiceResult('hyperxosist-query',x));
 x.payment.demo=false;x.searchUrl='https://evil.invalid/search';assert.throws(()=>readServiceResult('hyperxosist-query',x));
 const y=copy(example['summarize-url']);y.url='javascript:alert(1)';assert.throws(()=>readServiceResult('summarize-url',y));
 y.url='https://example.com';y.summary='x'.repeat(1048577);assert.throws(()=>readServiceResult('summarize-url',y));
 const z={};z.z=z;assert.throws(()=>readServiceResult('fix-error',z));
});
test('fixed transport sends no signatures, credentials, followups or paid retries',async()=>{
 const calls=[];await collectAll({validate:true,fetchImpl:async(url,opt)=>{calls.push({url,opt});return new Response('{}',{status:url.startsWith(URLS.validator)?200:offers.services.some(s=>s.resource===url)?402:200});}});
 assert.equal(calls.length,15);assert.equal(calls.filter(x=>x.opt.method==='POST').length,10);
 for(const {url,opt} of calls){assert.equal(opt.redirect,'error');assert.equal(opt.credentials,'omit');assert.equal(opt.headers.Authorization,undefined);assert.equal(opt.headers['PAYMENT-SIGNATURE'],undefined);if(opt.method==='POST')assert.equal(opt.headers['X-KG-Traffic-Class'],'synthetic_probe');}
});
test('validator disabled without opt-in; only five unsigned probes',async()=>{
 const calls=[];await collectAll({fetchImpl:async(url)=>{calls.push(url);return new Response('{}');}});assert.equal(calls.length,10);assert.ok(!calls.includes(URLS.validator));
});
test('redirects, giant bodies and private exception strings remain sanitized',async()=>{
 const a=await collectAll({fetchImpl:async()=>{throw new Error('NEVER_EMIT_SECRET');}});assert.doesNotMatch(JSON.stringify(a),/NEVER_EMIT/);
 for(const response of [()=>({status:200,redirected:true}),()=>new Response('x'.repeat(1048577))]){
  const v=await collectAll({fetchImpl:async()=>response()});assert.ok(Object.values(v.common).every(x=>x.unavailable));
 }
});
test('AVU requires recent green health but is never silently promoted',()=>{
 const a={common:{avu:{status:200,data:{status:'ok',time:'2026-08-22T00:00:00Z',checks:{cost_basis_fresh:true,runtime_enabled:true,payments_enabled:true}}}},individual:{}};
 let r=makeReport(a,'2026-09-07T00:00:00Z');assert.equal(r.avu.fresh_health_observed,false);assert.equal(r.avu.promoted,false);
 a.common.avu.data.time='2026-09-07T00:00:00Z';r=makeReport(a,'2026-09-07T00:00:01Z');assert.equal(r.avu.fresh_health_observed,true);assert.equal(r.avu.promoted,false);
});
test('no network without explicit CLI opt-in; arbitrary URLs are rejected',async()=>{
 await assert.rejects(main([]),/LIVE_OPT_IN_REQUIRED/);await assert.rejects(main(['--live','--url','https://evil.invalid']),/INVALID_ARGUMENTS/);
});
