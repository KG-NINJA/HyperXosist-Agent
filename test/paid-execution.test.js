'use strict';

const assert = require('assert');
const path = require('path');
const PaidExecution = require(path.join(__dirname, '..', 'paid-execution.js'));
const fixture = require('./fixtures/paid-flow.cjs');
let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (error) { failed++; console.error(`  ✗ ${name}\n    ${error.message}`); }
}
function encoded(value) { return Buffer.from(JSON.stringify(value), 'utf8').toString('base64'); }
function fakeResponse(status, body, headers = {}) {
  const values = new Map(Object.entries(headers).map(([name,value]) => [name.toLowerCase(),String(value)]));
  return {status, ok: status>=200 && status<300, headers: {get(name) { return values.get(String(name).toLowerCase()) || null; }},
    async text() { return body == null ? '' : typeof body === 'string' ? body : JSON.stringify(body); }};
}
(async () => {
  await test('unpaid call surfaces x402 v2 PAYMENT-REQUIRED', async () => {
    const requirements=fixture.challenge(); let request;
    const result=await PaidExecution.execute({keywords:'Acme',mode:'live'},{fetch:async(url,init)=>{
      request={url,init};return fakeResponse(402,requirements,{'PAYMENT-REQUIRED':encoded(requirements),'X-Request-Id':'req-1'});
    }});
    assert.strictEqual(request.url,fixture.endpoint);assert.strictEqual(request.init.method,'POST');
    assert.strictEqual(request.init.headers['PAYMENT-SIGNATURE'],undefined);assert.strictEqual(result.stage,'payment_required');
    assert.strictEqual(result.paymentRequired,true);assert.deepStrictEqual(result.x402.paymentRequired,requirements);
    assert.strictEqual(result.retry.arguments.confirmPayment,true);
  });
  await test('payment signature requires explicit confirmation without network access', async () => {
    let calls=0;const signature=encoded({payload:'signed'});
    const result=await PaidExecution.execute({keywords:'Acme'},{paymentSignature:signature,fetch:async()=>{calls++;return fakeResponse(200,{});}});
    assert.strictEqual(calls,0);assert.strictEqual(result.error.code,'payment_confirmation_required');assert.ok(!JSON.stringify(result).includes(signature));
  });
  await test('confirmed retry forwards PAYMENT-SIGNATURE and returns PAYMENT-RESPONSE', async () => {
    const signature=encoded({payload:'signed'}),settlement=fixture.settlement();let request;
    const result=await PaidExecution.execute({keywords:'Acme'},{paymentSignature:signature,confirmPayment:true,fetch:async(url,init)=>{
      request={url,init};return fakeResponse(200,fixture.output(),{'PAYMENT-RESPONSE':encoded(settlement),'X-Request-Id':'req-2'});
    }});
    assert.strictEqual(request.init.headers['PAYMENT-SIGNATURE'],signature);assert.strictEqual(result.ok,true);assert.strictEqual(result.stage,'completed');
    assert.strictEqual(result.paid,true);assert.deepStrictEqual(result.x402.paymentResponse,settlement);assert.ok(!JSON.stringify(result).includes(signature));
  });
  await test('rejects payment header injection', async () => {
    let calls=0;const result=await PaidExecution.execute({keywords:'Acme'},{paymentSignature:'abc\r\nX-Evil: yes',confirmPayment:true,fetch:async()=>{calls++;return fakeResponse(200,{});}});
    assert.strictEqual(calls,0);assert.strictEqual(result.error.code,'invalid_payment_signature');
  });
  await test('staging stays on the configured staging endpoint', async () => {
    let url;await PaidExecution.execute({keywords:'Acme'},{paymentEnvironment:'staging',fetch:async target=>{url=target;return fakeResponse(402,{});}});
    assert.ok(url.includes('mainnet-staging.fuwafuwow.workers.dev/hyperxosist-query'));
  });
  await test('network failure is normalized without leaking details', async () => {
    const result=await PaidExecution.execute({keywords:'Acme'},{fetch:async()=>{throw new Error('SECRET_NETWORK_MARKER');}});
    assert.strictEqual(result.error.code,'network_error');assert.ok(!JSON.stringify(result).includes('SECRET_NETWORK_MARKER'));
  });
  await test('pre-aborted request does not call the endpoint', async () => {
    const c=new AbortController();c.abort();let calls=0;
    const result=await PaidExecution.execute({keywords:'Acme'},{signal:c.signal,fetch:async()=>{calls++;return fakeResponse(200,{});}});
    assert.strictEqual(result.error.code,'aborted');assert.strictEqual(calls,0);
  });
  const signature = encoded({ payload: 'synthetic-not-a-real-signature' });
  const signed = fetch => ({paymentSignature: signature, confirmPayment: true, fetch});
  const headers = () => ({'PAYMENT-RESPONSE': encoded(fixture.settlement())});
  await test('signature alone never implies settlement; correct delivery stays available for reconciliation', async () => {
    const result = await PaidExecution.execute({keywords:'Acme'}, signed(async()=>fakeResponse(200,fixture.output())));
    assert.strictEqual(result.paid,null); assert.strictEqual(result.stage,'outcome_unknown');
    assert.strictEqual(result.paymentAttempted,true); assert.strictEqual(result.delivery.state,'received');
    assert.strictEqual(result.reconciliationRequired,true); assert.strictEqual(result.automaticRetryAllowed,false);
    assert.strictEqual(result.settlement.independentlyVerified,false); assert.strictEqual(result.result.query,'Acme -spam');
  });
  await test('signed 402 never asks for another signature and performs one request only', async () => {
    let calls=0; const ch=fixture.challenge();
    const result=await PaidExecution.execute({keywords:'Acme'},signed(async()=>{calls++;return fakeResponse(402,ch,{'PAYMENT-REQUIRED':encoded(ch)});}));
    assert.strictEqual(calls,1);assert.strictEqual(result.stage,'outcome_unknown');assert.strictEqual(result.retry,undefined);
    assert.strictEqual(result.paid,null);assert.match(result.nextAction,/Do not create a new signature/);
  });
  await test('signed network failure remains unknown and never exposes the signature or exception', async () => {
    const result=await PaidExecution.execute({keywords:'Acme'},signed(async()=>{throw new Error(signature);}));
    assert.strictEqual(result.paid,null);assert.strictEqual(result.reconciliationRequired,true);assert.ok(!JSON.stringify(result).includes(signature));
  });
  await test('deadline applies to a body that never resolves after successful headers', async () => {
    const start=Date.now();let canceled=false;
    const body=new ReadableStream({pull(){return new Promise(()=>{});},cancel(){canceled=true;}});
    const result=await PaidExecution.execute({keywords:'Acme'},{...signed(async()=>new Response(body,{status:200,headers:{...headers(),'X-Request-Id':'req-body-timeout'}})),timeoutMs:25});
    assert.ok(Date.now()-start<1000);assert.strictEqual(result.error.code,'aborted');assert.strictEqual(result.stage,'outcome_unknown');
    assert.strictEqual(result.requestId,'req-body-timeout');assert.strictEqual(result.settlement.state,'reported_success');
    assert.strictEqual(result.delivery.state,'not_received');assert.strictEqual(canceled,true);
  });
  await test('a non-cooperating fetch is bounded too', async () => {
    const start=Date.now();const result=await PaidExecution.execute({keywords:'Acme'},{...signed(()=>new Promise(()=>{})),timeoutMs:25});
    assert.ok(Date.now()-start<1000);assert.strictEqual(result.error.code,'aborted');assert.strictEqual(result.paid,null);
  });
  await test('external abort during text adapter read is normalized', async () => {
    const controller=new AbortController();
    const result=await PaidExecution.execute({keywords:'Acme'},{...signed(async()=>({status:200,headers:{get(){return null;}},text(){setTimeout(()=>controller.abort(),10);return new Promise(()=>{});}})),signal:controller.signal,timeoutMs:300});
    assert.strictEqual(result.error.code,'aborted');assert.strictEqual(result.reconciliationRequired,true);
  });
  await test('stream rejection does not throw to the caller or leak raw errors', async () => {
    const body=new ReadableStream({start(c){c.error(new Error('DO_NOT_RETURN_PRIVATE_DATA'));}});
    const result=await PaidExecution.execute({keywords:'Acme'},signed(async()=>new Response(body,{status:200,headers:headers()})));
    assert.strictEqual(result.stage,'outcome_unknown');assert.strictEqual(result.settlement.state,'reported_success');assert.ok(!JSON.stringify(result).includes('DO_NOT_RETURN_PRIVATE_DATA'));
  });
  await test('byte limits apply to streamed and announced bodies', async () => {
    for(const response of [()=>new Response('x'.repeat(1048577),{headers:headers()}),()=>new Response('{}',{headers:{...headers(),'Content-Length':'1048577'}})]){
      const result=await PaidExecution.execute({keywords:'Acme'},signed(async()=>response()));
      assert.strictEqual(result.error.code,'response_too_large');assert.strictEqual(result.reconciliationRequired,true);
    }
  });
  await test('empty, HTML, null and array HTTP 200 bodies are not completed deliveries', async () => {
    for(const body of ['', '<html>gateway error</html>', 'null', '[]']){
      const result=await PaidExecution.execute({keywords:'Acme'},signed(async()=>fakeResponse(200,body,headers())));
      assert.strictEqual(result.ok,false);assert.strictEqual(result.error.code,'invalid_response_json');assert.strictEqual(result.stage,'outcome_unknown');
    }
  });
  await test('invalid success output, demo/bypass and wrong destination URLs do not pass', async () => {
    for(const mutate of [b=>delete b.query,b=>b.payment.demo=true,b=>b.payment.bypass='test',b=>b.payment.price='$1',b=>b.payment.network='eip155:84532',b=>b.searchUrl='https://evil.invalid/search',b=>b.searchUrl='https://user:pass@x.com/search',b=>b.generated_at='garbage',b=>b.extra=true]){
      const body=fixture.output();mutate(body);
      const result=await PaidExecution.execute({keywords:'Acme'},signed(async()=>fakeResponse(200,body,headers())));
      assert.strictEqual(result.error.code,'invalid_result');assert.strictEqual(result.delivery.state,'invalid_result');assert.strictEqual(result.result,undefined);
    }
  });
  await test('legacy X-PAYMENT-RESPONSE is supported with explicit evidence boundaries', async () => {
    const result=await PaidExecution.execute({keywords:'Acme'},signed(async()=>fakeResponse(200,fixture.output(),{'X-PAYMENT-RESPONSE':encoded(fixture.settlement())})));
    assert.strictEqual(result.ok,true);assert.strictEqual(result.settlement.state,'reported_success');assert.strictEqual(result.settlement.independentlyVerified,false);assert.strictEqual(result.delivery.outcomeVerified,false);
  });
  await test('conflicting settlement headers never produce a paid success', async () => {
    const other=fixture.settlement();other.transaction='0x'+'c'.repeat(64);
    const result=await PaidExecution.execute({keywords:'Acme'},signed(async()=>fakeResponse(200,fixture.output(),{...headers(),'X-PAYMENT-RESPONSE':encoded(other)})));
    assert.strictEqual(result.ok,false);assert.strictEqual(result.paid,null);assert.strictEqual(result.settlement.state,'invalid_report');
  });
  await test('malformed settlement proofs cannot be treated as paid', async () => {
    for(const value of [{success:true,transaction:'0xabc'},false,[],{...fixture.settlement(),network:'eip155:84532'},{...fixture.settlement(),payer:'invalid'}]){
      const result=await PaidExecution.execute({keywords:'Acme'},signed(async()=>fakeResponse(200,fixture.output(),{'PAYMENT-RESPONSE':encoded(value)})));
      assert.strictEqual(result.ok,false);assert.strictEqual(result.paid,null);assert.strictEqual(result.settlement.state,'invalid_report');
    }
  });
  await test('explicit reported failure stays separate from successful result body', async () => {
    const report={...fixture.settlement(),success:false};
    const result=await PaidExecution.execute({keywords:'Acme'},signed(async()=>fakeResponse(200,fixture.output(),{'PAYMENT-RESPONSE':encoded(report)})));
    assert.strictEqual(result.paid,false);assert.strictEqual(result.settlement.state,'reported_failure');assert.strictEqual(result.reconciliationRequired,true);
  });
  await test('all signed upstream failures require reconciliation without echoing upstream data', async () => {
    for(const status of [400,401,403,429,500,503]){
      const result=await PaidExecution.execute({keywords:'Acme'},signed(async()=>fakeResponse(status,{error:signature})));
      assert.strictEqual(result.stage,'outcome_unknown');assert.strictEqual(result.paid,null);assert.strictEqual(result.retry,undefined);assert.ok(!JSON.stringify(result).includes(signature));assert.strictEqual(result.upstream,undefined);
    }
  });
  await test('unsigned 200 is not proof of a paid purchase', async () => {
    const result=await PaidExecution.execute({keywords:'Acme'},{fetch:async()=>fakeResponse(200,fixture.output())});
    assert.strictEqual(result.ok,false);assert.strictEqual(result.paid,false);assert.strictEqual(result.paymentAttempted,false);
  });
  await test('missing, falsey or altered payment requirements are blocked without a retry recipe', async () => {
    for(const value of [null,false,[],{}, {...fixture.challenge(),x402Version:'2'}]){
      const result=await PaidExecution.execute({keywords:'Acme'},{fetch:async()=>fakeResponse(402,{},value===null?{}:{'PAYMENT-REQUIRED':encoded(value)})});
      assert.strictEqual(result.error.code,'invalid_challenge');assert.strictEqual(result.retry,undefined);
    }
  });
  await test('challenge monetary pins and body/header continuity are enforced', async () => {
    for(const mutate of [c=>c.accepts[0].amount='1',c=>c.accepts[0].payTo='0x'+'b'.repeat(40),c=>c.resource.url='https://evil.invalid',c=>c.accepts[0].asset='USDC',c=>c.accepts[0].network='eip155:84532']){
      const ch=fixture.challenge();mutate(ch);
      const result=await PaidExecution.execute({keywords:'Acme'},{fetch:async()=>fakeResponse(402,{payment_required:ch},{'PAYMENT-REQUIRED':encoded(ch)})});assert.strictEqual(result.error.code,'invalid_challenge');
    }
    const ch=fixture.challenge(),echo=fixture.challenge();echo.accepts[0].amount='1';
    const result=await PaidExecution.execute({keywords:'Acme'},{fetch:async()=>fakeResponse(402,{payment_required:echo},{'PAYMENT-REQUIRED':encoded(ch)})});assert.strictEqual(result.error.code,'invalid_challenge');
  });
  await test('cyclic, huge, bigint or altered-toJSON input fails before network', async () => {
    const cycle={};cycle.self=cycle;let calls=0;
    for(const input of [cycle,{big:1n},{text:'x'.repeat(65537)},{toJSON(){return null;}}]){
      const result=await PaidExecution.execute(input,{...signed(async()=>{calls++;return fakeResponse(200,{});})});assert.strictEqual(result.error.code,'invalid_input');assert.strictEqual(result.paymentAttempted,false);
    }
    assert.strictEqual(calls,0);
  });
  await test('retry request is a snapshot rather than mutable caller data', async () => {
    const input={keywords:'original'},ch=fixture.challenge();
    const result=await PaidExecution.execute(input,{fetch:async()=>fakeResponse(402,ch,{'PAYMENT-REQUIRED':encoded(ch)})});input.keywords='changed';assert.strictEqual(result.retry.arguments.input.keywords,'original');
  });
  await test('real native Response success and aborted cleanup path both remain usable', async () => {
    const result=await PaidExecution.execute({keywords:'Acme'},signed(async()=>new Response(JSON.stringify(fixture.output()),{status:200,headers:headers()})));
    assert.strictEqual(result.ok,true);assert.strictEqual(result.status,200);assert.strictEqual(result.paid,true);
  });
  await test('header decoder is strict, bounded and UTF-8 safe', async () => {
    assert.deepStrictEqual(PaidExecution.decodeBase64Json(encoded({label:'日本語'})),{label:'日本語'});
    for(const value of ['!bad','a'.repeat(65537),encoded(null),encoded(false),encoded([])])assert.strictEqual(PaidExecution.decodeBase64Json(value),null);
  });
  console.log(`\n${passed} passed, ${failed} failed`);
  if(failed>0)process.exit(1);
})();
