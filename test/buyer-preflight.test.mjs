import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {validateCatalog,inspectInput,preparePurchase,shellQuote,POLICY,SERVICE_IDS} from '../buyer-preflight.mjs';
const catalog=JSON.parse(readFileSync(new URL('../service-offers.json',import.meta.url),'utf8'));
const clone=x=>structuredClone(x);
const text=id=>JSON.stringify(catalog.services.find(s=>s.id===id).example_request);
const inspect=(id,input)=>inspectInput(catalog,id,JSON.stringify(input));
for(const id of SERVICE_IDS){
 test(`${id}: existing real request example passes local preparation only`,()=>{
  const r=preparePurchase(catalog,id,text(id),{reviewed:true});assert.equal(r.ok,true,JSON.stringify(r));
  assert.equal(r.plan.request.url,`https://api.kgninja.dev/${id}`);assert.equal(r.plan.request.method,'POST');
  assert.equal(r.plan.authorization.granted,false);assert.equal(r.plan.execution.automatic,false);assert.equal(r.plan.execution.payment_sent,false);
  assert.equal(r.plan.retry_policy.repeat_unsigned_402,false);assert.equal(r.plan.retry_policy.automatic_repurchase,false);
  assert.equal(r.plan.execution.argv.at(-2),'10000');assert.equal(r.plan.expected_terms.payTo,POLICY.payTo);
 });
 test(`${id}: review and unreconciled prior outcome gates`,()=>{
  assert.equal(preparePurchase(catalog,id,text(id)).code,'approval_required');
  for(const priorOutcome of ['unknown','paid','timeout',null,42])assert.equal(preparePurchase(catalog,id,text(id),{reviewed:true,priorOutcome}).code,'reconcile_first');
 });
}
test('catalog changes never become new financial terms',()=>{
 for(const [key,value] of [['network','eip155:84532'],['amount','20000'],['asset','0x'+'1'.repeat(40)],['payTo','0x'+'2'.repeat(40)],['automatic_purchase',true],['version','2']]){
  const c=clone(catalog);c.payment_policy[key]=value;assert.throws(()=>validateCatalog(c));
  assert.equal(preparePurchase(c,'fix-error',text('fix-error'),{reviewed:true}).code,'catalog_unavailable');
 }
});
test('five exact URLs and nonduplicate service identities are required',()=>{
 for(const modify of [c=>c.services.pop(),c=>c.services[0].resource='https://evil.invalid',c=>c.services[0].method='GET',c=>c.services[0].id='unknown',c=>c.services[0].request_schema.additionalProperties=true]){
  const c=clone(catalog);modify(c);assert.throws(()=>validateCatalog(c));
 }
 assert.equal(preparePurchase(catalog,'avu','{}',{reviewed:true}).code,'catalog_unavailable');
});
test('immutable catalog result does not freeze or mutate caller evidence',()=>{
 const c=clone(catalog),result=validateCatalog(c);assert.ok(Object.isFrozen(result.services[0]));assert.ok(!Object.isFrozen(c));assert.deepEqual(c,catalog);
});
test('invalid JSON, arrays, null, controls and oversize content are rejected locally',()=>{
 assert.equal(inspectInput(catalog,'fix-error','{bad').code,'invalid_json');
 for(const input of ['null','false','0','[]'])assert.equal(inspectInput(catalog,'fix-error',input).code,'object_required');
 assert.equal(inspectInput(catalog,'fix-error','x'.repeat(16385)).code,'input_too_large');
 assert.equal(inspect('fix-error',{error:'bad\u0000text'}).code,'schema_mismatch');
});
test('missing failure, blank command and blank keywords cannot produce useless paid requests',()=>{
 for(const input of [{},{command:'npm run build'},{error:'  '}])assert.equal(inspect('fix-error',input).code,'failure_evidence_required');
 assert.equal(inspect('fix-error',{log:'Module not found'}).ok,true);
 assert.equal(inspect('shell-risk-check',{command:' '}).code,'empty_command');
 assert.equal(inspect('hyperxosist-query',{keywords:''}).code,'empty_keywords');
});
test('known input schemas reject unknown fields and string booleans',()=>{
 for(const input of [{keywords:'hello',lang:'english'},{keywords:'hello',noise:{enabled:'true'}},{keywords:'hello',noise:{secret:1}},{keywords:'hello',extra:true}])assert.equal(inspect('hyperxosist-query',input).code,'schema_mismatch');
});
test('string numeric filters receive stricter preparation validation, not a server contract change',()=>{
 for(const value of ['-1','1e3','-0','abc','1.5'])assert.equal(inspect('hyperxosist-query',{keywords:'hello',minFaves:value}).code,'invalid_numeric_filter');
 for(const value of [0,'0',123,'123'])assert.equal(inspect('hyperxosist-query',{keywords:'hello',minFaves:value}).ok,true);
});
test('definite credential patterns block command preparation without echoing the secret',()=>{
 for(const error of ['Authorization: Bearer SUPER_SECRET_TOKEN','api_key=SECRET_VALUE_123','-----BEGIN PRIVATE KEY----- secret','PAYMENT-SIGNATURE: abcdefghijklmnop']){
  const r=inspect('fix-error',{error});assert.equal(r.code,'secret_detected');assert.ok(!JSON.stringify(r).includes(error));
 }
 assert.equal(inspect('fix-error',{error:'401 Unauthorized: API token invalid'}).ok,true);
});
test('private, IP, credential-bearing, signed-query and non-web URL inputs are blocked',()=>{
 for(const url of ['http://localhost/a','http://127.0.0.1','http://2130706433','http://[::1]/','http://foo.local','https://u:p@example.com','javascript:alert(1)','https://example.com?token=abc','https://example.com#secret'])assert.equal(inspect('summarize-url',{url}).code,'public_url_required');
 assert.equal(inspect('summarize-url',{url:'https://example.com/docs?q=hello'}).ok,true);
});
test('aggregate telemetry is not marketed as arbitrary-site audit',()=>{
 for(const input of [{target_url:'https://example.com'},{mode:'website'}])assert.equal(inspect('agent-visibility-report',input).code,'aggregate_only');
 assert.equal(inspect('agent-visibility-report',{}).ok,true);
});
test('prototype and undocumented nested fields are rejected',()=>{
 assert.equal(inspectInput(catalog,'fix-error','{"error":"x","__proto__":{"polluted":true}}').code,'schema_mismatch');
 assert.equal({}.polluted,undefined);
});
test('POSIX quoting preserves adversarial user text as one literal argument',()=>{
 const inputs=["Cannot find 'hono'",'$(printf HACKED)',"'; printf HACKED; #",'`printf HACKED`','日本語\n2行目','x\\y "z"'];
 for(const input of inputs){
  const command=`printf '%s' ${shellQuote(input)}`;
  const output=execFileSync('/bin/sh',['-c',command],{encoding:'utf8'});assert.equal(output,input);
 }
 assert.throws(()=>shellQuote('x\0y'));
});
test('generated CLI carries JSON as a single literal --data argument',()=>{
 const input={error:"Cannot find 'hono' $(printf SHOULD_NOT_RUN)",command:'npm run build'};
 const r=preparePurchase(catalog,'fix-error',JSON.stringify(input),{reviewed:true});assert.equal(r.ok,true);
 const argv=r.plan.execution.argv;assert.deepEqual(JSON.parse(argv[argv.indexOf('--data')+1]),input);
 assert.equal(argv[argv.indexOf('--max-amount')+1],'10000');
});
test('input changes cannot mutate an existing plan',()=>{
 const c=clone(catalog),r=preparePurchase(c,'fix-error',text('fix-error'),{reviewed:true});c.payment_policy.amount='1';
 assert.equal(r.plan.expected_terms.amount,'10000');assert.equal(r.plan.authorization.local_review_recorded,true);
});
test('public agent instructions no longer command retry-until-success',()=>{
 const agents=readFileSync(new URL('../AGENTS.md',import.meta.url),'utf8');
 assert.doesNotMatch(agents,/Retry until \*\*200\*\*/);assert.match(agents,/stop and reconcile/);
 const page=readFileSync(new URL('../first-purchase.md',import.meta.url),'utf8');assert.match(page,/自動送信/);assert.match(page,/Content-Security-Policy/);
});
test('UI has no upload, signer, telemetry, polling or body persistence capability',()=>{
 const source=readFileSync(new URL('../assets/purchase-preparer.mjs',import.meta.url),'utf8');
 assert.equal((source.match(/fetch\(/g)||[]).length,1);assert.match(source,/\.\.\/service-offers\.json/);
 assert.doesNotMatch(source,/localStorage|sessionStorage|sendBeacon|setInterval|innerHTML|console\.log|ethereum\.request/);
});

test('P2: credential patterns in supported nested arrays are blocked before command creation',()=>{
 for(const token of ['api_key=SUPER_SECRET_VALUE_123','Authorization: Bearer NESTED_SECRET_TOKEN','PAYMENT-SIGNATURE: abcdefghijklmnop']){
  const input={keywords:'hello',noise:{removed:[token]}};
  const r=preparePurchase(catalog,'hyperxosist-query',JSON.stringify(input),{reviewed:true});
  assert.equal(r.code,'secret_detected');assert.ok(!JSON.stringify(r).includes(token));
  assert.equal(r.command,undefined);assert.equal(r.plan,undefined);
 }
 assert.equal(inspect('hyperxosist-query',{keywords:'hello',noise:{removed:['giveaway','sponsored']}}).ok,true);
});
test('P2: unrelated Grok example preserves the original two-argument API',()=>{
 const agents=readFileSync(new URL('../AGENTS.md',import.meta.url),'utf8');
 assert.match(agents,/createGrokBuildSession\(\s*'Grok Build code improvement for <PRODUCT>',\s*\{ product: '<PRODUCT>', targetArea: 'auth' \}/);
});
