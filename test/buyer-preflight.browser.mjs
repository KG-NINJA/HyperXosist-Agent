// Headless UI QA served locally with the production page's CSP. No seller calls.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PACKAGE||'playwright');
const root=resolve('.'),out=join(process.env.RUNNER_TEMP||'/tmp','buyer-preflight-qa');
await mkdir(out,{recursive:true});
const routes={'/paid-execution.js':['paid-execution.js','text/javascript'],'/payment-endpoints.js':['payment-endpoints.js','text/javascript'],'/first-purchase.html':['first-purchase.html','text/html'],'/buyer-preflight.mjs':['buyer-preflight.mjs','text/javascript'],'/assets/purchase-preparer.mjs':['assets/purchase-preparer.mjs','text/javascript'],'/assets/purchase-preparer.css':['assets/purchase-preparer.css','text/css'],'/service-offers.json':['service-offers.json','application/json'],'/favicon.svg':['favicon.svg','image/svg+xml']};
const server=createServer(async(req,res)=>{
  const row=routes[new URL(req.url,'http://localhost').pathname];
  if(req.method!=='GET'||!row){res.writeHead(404);res.end();return;}
  try{let text=await readFile(join(root,row[0]),'utf8');res.writeHead(200,{'Content-Type':row[1]+'; charset=utf-8'});res.end(text);}
  catch{res.writeHead(500);res.end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true});
const errors=[],calls=[];let passed=false;
try{
 const context=await browser.newContext({viewport:{width:1365,height:1000},permissions:['clipboard-read','clipboard-write'],acceptDownloads:true});
 await context.route('**/*',async route=>{const r=route.request();calls.push({url:r.url(),method:r.method()});if(!r.url().startsWith(origin+'/'))await route.abort();else await route.continue();});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(origin+'/first-purchase.html');await page.locator('#preparer').waitFor();
 // Exercise the actual browser bridge with native responses and injected OFFLINE transport.
 await page.addScriptTag({url:origin+'/payment-endpoints.js'});
 await page.addScriptTag({url:origin+'/paid-execution.js'});
 const bridge = await page.evaluate(async () => {
   const signed={paymentSignature:btoa(JSON.stringify({synthetic:true})),confirmPayment:true};
   let calls=0;
   const failure=await window.HyperXosistPaidExecution.execute({keywords:'offline'}, {...signed, fetch:async()=>{calls++;return new Response('{"error":"synthetic"}',{status:500});}});
   const waiting=await window.HyperXosistPaidExecution.execute({keywords:'offline'}, {...signed,timeoutMs:25,fetch:async()=>{calls++;return new Response(new ReadableStream({pull(){return new Promise(()=>{});}}),{status:200});}});
   return {calls,failure:{stage:failure.stage,paid:failure.paid,reconcile:failure.reconciliationRequired},waiting:{stage:waiting.stage,code:waiting.error.code,reconcile:waiting.reconciliationRequired}};
 });
 assert.deepEqual(bridge,{calls:2,failure:{stage:'outcome_unknown',paid:null,reconcile:true},waiting:{stage:'outcome_unknown',code:'aborted',reconcile:true}});
 assert.equal(await page.title(),'API購入準備 — KG-NINJA');assert.equal(await page.evaluate(()=>document.compatMode),'CSS1Compat');assert.equal(await page.locator('#prepare').isDisabled(),true);
 await page.locator('#reviewed').check();await page.locator('#prepare').click();assert.equal(await page.locator('#prepared').isVisible(),true);
 await page.locator('#copy-command').click();
 // Clipboard writes resolve asynchronously; verify completion, not merely a click.
 await page.waitForFunction(()=>document.getElementById('action-feedback').textContent.includes('コピーしました'),null,{timeout:5000});
 assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),await page.locator('#command').innerText());
 const download=page.waitForEvent('download');await page.locator('#save-plan').click();const d=await download;await d.saveAs(join(out,'sample-request.json'));
 const plan=JSON.parse(await readFile(join(out,'sample-request.json'),'utf8'));assert.equal(plan.authorization.granted,false);assert.equal(plan.execution.payment_sent,false);
 await page.locator('#request').fill('{"error":"changed example"}');assert.equal(await page.locator('#prepared').isHidden(),true);assert.equal(await page.locator('#reviewed').isChecked(),false);
 await page.locator('#prior-outcome').selectOption('unknown');assert.equal(await page.locator('#prepare').isDisabled(),true);assert.match(await page.locator('#input-feedback').innerText(),/照合/);
 await page.locator('#prior-outcome').selectOption('not_started');
 for(const id of ['fix-error','summarize-url','shell-risk-check','agent-visibility-report','hyperxosist-query']){
  await page.locator('#service').selectOption(id);assert.match(await page.locator('#input-feedback').innerText(),/合格/);await page.locator('#reviewed').check();await page.locator('#prepare').click();assert.ok((await page.locator('#command').innerText()).includes('/'+id));
 }
 await page.locator('#service').selectOption('summarize-url');await page.locator('#request').fill('{"url":"http://localhost."}');assert.match(await page.locator('#input-feedback').innerText(),/公開HTTP/);assert.equal(await page.locator('#prepare').isDisabled(),true);
 await page.locator('#service').selectOption('fix-error');await page.locator('#request').fill('{"error":"Authorization: Bearer DEMO_CREDENTIAL_123"}');assert.match(await page.locator('#input-feedback').innerText(),/認証情報/);assert.equal(await page.locator('#prepare').isDisabled(),true);
 await page.locator('#request').fill('{"error":"<img src=https://example.com/x onerror=alert(1)>"}');await page.locator('#reviewed').check();await page.locator('#prepare').click();assert.equal(await page.locator('img').count(),0);
 await page.locator('#example').click();await page.locator('#reviewed').check();await page.locator('#prepare').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:join(out,'desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.reload();await page.locator('#preparer').waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:join(out,'mobile.png'),fullPage:true});
 await page.route('**/service-offers.json',route=>route.fulfill({status:200,body:'null',contentType:'application/json'}));await page.reload();await page.locator('#load-status[data-kind="error"]').waitFor();assert.equal(await page.locator('#preparer').isHidden(),true);
 assert.deepEqual(errors,[]);assert.ok(calls.every(r=>r.method==='GET'&&r.url.startsWith(origin+'/')));passed=true;await context.close();
}finally{
 await writeFile(join(out,'result.json'),JSON.stringify({passed,console_errors:errors,requests:calls,real_payment:false,seller_requests:0,csp_present:true,offline_browser_bridge_scenarios:2,viewports:[[1365,1000],[390,844]]},null,2));
 await browser.close();await new Promise(done=>server.close(done));
}
console.log('BUYER_UI_PASSED: source HTML + CSP, five routes, approval/reset/recovery, clipboard, download, desktop/mobile, zero seller/payment requests.');
