import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { collect, evaluate, projectDiscovery, decodeChallenge, validTerms, receiptShape, main, RESOURCE, URLS } from '../scripts/fix-error-readiness.mjs';
const recipe = JSON.parse(readFileSync(new URL('../fix-error-quickstart.json', import.meta.url)));
const copy = x => structuredClone(x);
const result = {root_cause:'Unresolved dependency.', next_command:'npm install hono', retry_plan:['Review dependencies.'], risk_note:'Review first.', prevention_note:'Use locked dependencies.', generated_at:'2026-09-07T00:00:00Z'};
const terms = {scheme:'exact', network:recipe.payment.network, asset:recipe.payment.asset, payTo:recipe.payment.pay_to, amount:'10000', maxTimeoutSeconds:300};
const api = {paths:{'/fix-error':{post:{
  requestBody:{content:{'application/json':{schema:recipe.request_schema, example:recipe.request_examples[0].request}}},
  responses:{'200':{content:{'application/json':{schema:recipe.response_schema, example:result}}}},
  'x-payment-info':{protocol:'x402',version:2,scheme:'exact',price:'$0.01',network:terms.network,payTo:terms.payTo,bazaar_indexing:{asset_contract:terms.asset}}
}}}};
const challenge = {x402Version:2,resource:{url:RESOURCE,description:recipe.description},accepts:[terms],extensions:{bazaar:{info:{input:{type:'http',method:'POST',bodyType:'json',body:recipe.request_examples[0].request},output:{type:'json',example:result}},schema:{type:'object'}}}};
const header = x => Buffer.from(JSON.stringify(x)).toString('base64');
function good() {
  return copy({
    openapi:{status:200,data:api},
    options:{status:200,data:{network:terms.network,x402Version:2,scheme:'exact',price:'0.01 USDC',assetAddress:terms.asset,payTo:terms.payTo}},
    preview:{status:200,data:{expected_output_schema:recipe.response_schema}},
    discovery:{status:200,data:{resources:[{resource:RESOURCE,x402Version:2,accepts:[terms],metadata:{output:{example:result}}}]}},
    integrity:{status:200,data:{matched:15,confirmed_amount:'0.15'}},
    challenge:{status:402,data:{payment_required:challenge},payment_required:header(challenge)},
    validator:{status:200,data:{valid:true,statusCode:402,x402Version:2,simulation:{outcome:'accepted'},preflight:[{check:'reachable',severity:'required',passed:true}],index:{active:true,quality:{l30DaysTotalCalls:5,l30DaysUniquePayers:2}}}}
  });
}
test('positive result states unpaid checks, never a paid purchase', () => {
  const report=evaluate(good(),recipe);
  assert.equal(report.state,'unpaid_checks_passed');
  assert.equal(report.safety.payment_sent,false);
  assert.equal(report.safety.sales_generated,false);
  assert.equal(report.boundaries.live_paid_delivery_tested,false);
  assert.equal(report.boundaries.buyer_identity_verified,false);
});
test('projected schema and examples come from OpenAPI, not copied payment authority', () => {
  const p=projectDiscovery(api,recipe);
  assert.deepEqual(p.options.inputSchema,recipe.request_schema);
  assert.deepEqual(p.options.output.example,result);
  assert.equal(p.application,'review_only_not_deployed');
  assert.match(p.source_sha256,/^sha256:[0-9a-f]{64}$/);
});
for (const [key,value] of [['amount','100000'],['network','eip155:84532'],['asset','0x'+'1'.repeat(40)],['payTo','0x'+'2'.repeat(40)],['scheme','upto'],['maxTimeoutSeconds',0]]) {
  test(`different challenge ${key} is blocked`, () => {
    const o=good(); const changed=copy(challenge); changed.accepts[0][key]=value;
    o.challenge.payment_required=header(changed);o.challenge.data.payment_required=changed;
    assert.equal(evaluate(o,recipe).state,'blocked');
    assert.equal(validTerms(changed.accepts[0]),false);
  });
}
test('changed live OpenAPI price cannot be projected', () => {
  const x=copy(api);x.paths['/fix-error'].post['x-payment-info'].price='$0.02';
  assert.throws(()=>projectDiscovery(x,recipe),/TERMS_CHANGED/);
});
test('missing output field blocks publication of a false projection',()=>{
  const x=copy(api);delete x.paths['/fix-error'].post.responses['200'].content['application/json'].example.next_command;
  assert.throws(()=>projectDiscovery(x,recipe));
});
test('generic wrapper is not the six-field receipt',()=>assert.equal(receiptShape({result:{value:'data'},paid:true}),false));
test('non-string receipt suggestion is rejected',()=>assert.equal(receiptShape({...result,next_command:{exec:'danger'}}),false));
test('invalid date is not accepted as receipt example',()=>assert.equal(receiptShape({...result,generated_at:'not-a-date'}),false));
test('invalid base64, malformed JSON and huge headers are rejected',()=>{
  for(const s of [null,'!bad','a'.repeat(65537),Buffer.from('not JSON').toString('base64')]) assert.throws(()=>decodeChallenge(s));
});
test('challenge body mismatch blocks; key order is irrelevant',()=>{
  const o=good();o.challenge.data.payment_required={extensions:challenge.extensions,accepts:challenge.accepts,resource:challenge.resource,x402Version:2};
  assert.equal(evaluate(o,recipe).state,'unpaid_checks_passed');
  o.challenge.data.payment_required=copy(challenge);o.challenge.data.payment_required.resource.url='https://example.com';
  assert.equal(evaluate(o,recipe).state,'blocked');
});
test('missing body echo stays unknown',()=>{
  const o=good();o.challenge.data={};assert.equal(evaluate(o,recipe).state,'partial');
});
test('missing input example is actionable, not proof of failed payments',()=>{
  const o=good(),c=copy(challenge);delete c.extensions.bazaar.info.input.body;
  o.challenge.payment_required=header(c);o.challenge.data.payment_required=c;
  const r=evaluate(o,recipe);assert.equal(r.state,'partial');assert.ok(r.incomplete_checks.includes('challenge_input_example'));
});
test('missing bazaar extension blocks discovery readiness',()=>{
  const o=good(),c=copy(challenge);delete c.extensions;
  o.challenge.payment_required=header(c);o.challenge.data.payment_required=c;
  assert.ok(evaluate(o,recipe).failed_checks.includes('challenge_bazaar_present'));
});
test('generic short listing description is a warning',()=>{
  const o=good(),c=copy(challenge);c.resource.description='Fix error';
  o.challenge.payment_required=header(c);o.challenge.data.payment_required=c;
  assert.ok(evaluate(o,recipe).incomplete_checks.includes('challenge_description_useful'));
});
test('validator unavailable, auth-required or not requested is unknown, never accepted',()=>{
  for(const v of [undefined,{unavailable:true},{status:401},{status:502}]){
    const o=good();o.validator=v;assert.equal(evaluate(o,recipe).state,'partial');
  }
});
test('official validator rejection is a failure',()=>{
  const o=good();o.validator.data.valid=false;assert.equal(evaluate(o,recipe).state,'blocked');
});
test('required preflight failure overrides superficially valid output',()=>{
  const o=good();o.validator.data.preflight[0].passed=false;assert.equal(evaluate(o,recipe).state,'blocked');
});
test('empty preflight is not treated as successful verification',()=>{
  const o=good();o.validator.data.preflight=[];assert.equal(evaluate(o,recipe).state,'blocked');
});
test('HTTP 200 on an unpaid operation does not certify a paid route',()=>{
  const o=good();o.challenge.status=200;assert.equal(evaluate(o,recipe).state,'blocked');
});
test('no validator means no claim of active indexing',()=>{
  const o=good();delete o.validator;assert.equal(evaluate(o,recipe).bazaar_index,null);
});
test('source-reported counts remain separate from independently proven customers',()=>{
  const r=evaluate(good(),recipe);
  assert.equal(r.source_reported_revenue.matched,15);
  assert.equal(r.source_reported_revenue.attribution,'seller_aggregate_not_independently_verified');
  assert.deepEqual(r.bazaar_index,{active:true,calls_30d:5,payers_30d:2});
  assert.equal(r.boundaries.new_external_sales_proven,false);
});
test('raw remote details and payment headers are omitted from public report',()=>{
  const o=good();o.integrity.data.secret='NEVER_EMIT';o.validator.data.preflight[0].detail='NEVER_EMIT';
  const text=JSON.stringify(evaluate(o,recipe));assert.doesNotMatch(text,/NEVER_EMIT/);assert.doesNotMatch(text,new RegExp(header(challenge)));
});
test('transport is fixed-origin, no credentials/redirects/retries, only synthetic unsigned writes',async()=>{
  const calls=[];const f=async(url,opt)=>{calls.push([url,opt]);return new Response('{}',{status:url===RESOURCE?402:200});};
  await collect({fetchImpl:f,validate:true});assert.equal(calls.length,7);
  for(const [url,opt] of calls){
    assert.ok(Object.values(URLS).includes(url));assert.equal(opt.redirect,'error');assert.equal(opt.credentials,'omit');
    assert.equal(opt.headers.Authorization,undefined);assert.equal(opt.headers['PAYMENT-SIGNATURE'],undefined);
    if(opt.method==='POST'){
      assert.ok([RESOURCE,URLS.validator].includes(url));
      if(url===RESOURCE)assert.match(opt.body,/Synthetic unpaid/);
      else assert.deepEqual(JSON.parse(opt.body),{resource:RESOURCE,method:'POST'});
    }
  }
});
test('validator requires explicit opt-in',async()=>{
  const calls=[];await collect({fetchImpl:async(url)=>{calls.push(url);return new Response('{}');}});
  assert.equal(calls.length,6);assert.ok(!calls.includes(URLS.validator));
});
test('redirected response and oversized response rejected without printing body',async()=>{
  for(const kind of ['redirect','size']){
    const o=await collect({fetchImpl:async()=>kind==='redirect'?{redirected:true}:new Response('{}',{headers:{'content-length':'1048577'}})});
    assert.ok(Object.values(o).every(x=>x.unavailable));
  }
});
test('streamed byte limits enforced even without content-length',async()=>{
  const o=await collect({fetchImpl:async()=>new Response('x'.repeat(1048577))});
  assert.ok(Object.values(o).every(x=>x.code==='BODY_LIMIT'));
});
test('fetch failure is sanitized',async()=>{
  const o=await collect({fetchImpl:async()=>{throw new Error('secret value');}});
  assert.doesNotMatch(JSON.stringify(o),/secret value/);assert.equal(evaluate(o,recipe).state,'partial');
});
test('CLI never performs network work by default',async()=>{
  await assert.rejects(main([]),/EXPLICIT_LIVE/);await assert.rejects(main(['--url','https://evil.invalid']),/UNKNOWN_ARGUMENT/);
});
