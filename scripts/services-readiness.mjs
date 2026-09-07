import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { offers, matchesPinnedSchema } from '../service-receipts.mjs';

const origin = 'https://api.kgninja.dev';
export const URLS = Object.freeze({openapi: origin+'/openapi.json', catalog: origin+'/catalog.json', discovery: origin+'/.well-known/x402/discovery/resources', integrity: origin+'/revenue-log/integrity', avu: 'https://agent-economy.kgninja.dev/health', validator:'https://api.cdp.coinbase.com/platform/v2/x402/validate'});
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const canonical = x => Array.isArray(x) ? x.map(canonical) : record(x) ? Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])) : x;
const same = (a,b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const hash = x => 'sha256:'+createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
const address = (a,b) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase();
export function validTerms(x) {
  const p=offers.payment_policy;
  return record(x) && x.scheme === p.scheme && x.network === p.network && x.amount === p.amount && address(x.asset,p.asset) && address(x.payTo,p.payTo) && Number.isSafeInteger(x.maxTimeoutSeconds) && x.maxTimeoutSeconds>0 && x.maxTimeoutSeconds<=3600;
}
export function decodeChallenge(h) {
  if (typeof h !== 'string' || h.length>65536 || !/^[A-Za-z0-9+/]+={0,2}$/.test(h)) throw new Error('INVALID_CHALLENGE');
  const bytes=Buffer.from(h,'base64');
  if (bytes.toString('base64').replace(/=+$/,'')!==h.replace(/=+$/,'')) throw new Error('INVALID_CHALLENGE');
  const out=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if (!record(out)) throw new Error('INVALID_CHALLENGE');
  return out;
}
// Resolve local references only. Preserve all validation keywords so drift fails closed.
export function normalizeSchema(s, api, seen = [], depth = 0) {
  if (!record(s) || depth>24) throw new Error('UNSUPPORTED_SCHEMA');
  if (s.$ref) {
    if (!/^#\/components\/schemas\/[A-Za-z0-9_.-]+$/.test(s.$ref) || seen.includes(s.$ref) || Object.keys(s).some(k=>!['$ref','description','title'].includes(k))) throw new Error('UNSUPPORTED_SCHEMA');
    return normalizeSchema(api?.components?.schemas?.[s.$ref.split('/').at(-1)],api,[...seen,s.$ref],depth+1);
  }
  const out={};
  for (const [k,v] of Object.entries(s)) {
    if (['description','title','example','examples','$comment'].includes(k)) continue;
    if (k==='properties') { if(!record(v)) throw new Error('UNSUPPORTED_SCHEMA'); out[k]=Object.fromEntries(Object.entries(v).map(([p,c])=>[p,normalizeSchema(c,api,seen,depth+1)])); }
    else if (k==='items') out[k]=normalizeSchema(v,api,seen,depth+1);
    else if (k==='required' || k==='type' && Array.isArray(v)) { if(!Array.isArray(v)) throw new Error('UNSUPPORTED_SCHEMA'); out[k]=[...v].sort(); }
    else out[k]=v;
  }
  if (out.type==='object') { out.required ??= []; out.additionalProperties ??= true; }
  return canonical(out);
}
export function contractMatches(actual, expected, api) {
  try { return same(normalizeSchema(actual,api),normalizeSchema(expected,{})); } catch { return false; }
}
export function validValidation(v) {
  if (!record(v) || v.valid!==true || v.statusCode!==402 || v.x402Version!==2 || v.simulation?.outcome!=='accepted' || !Array.isArray(v.preflight)) return false;
  if (!v.preflight.every(x=>record(x)&&typeof x.check==='string'&&typeof x.passed==='boolean'&& (x.severity!=='required'||x.passed))) return false;
  const names=new Set(v.preflight.filter(x=>x.passed).map(x=>x.check.replace(/[^a-z0-9]/gi,'').toLowerCase()));
  // Support documented names and expanded names observed from the live CDP validator.
  // All mandatory checks must still pass; names alone never establish validity.
  return [['reachable','endpointreachable'],['returns402'],['hasbazaarextension'],['parse','validjson']].every(group=>group.some(x=>names.has(x)));
}
function observation(o, expected) {
  if (!o || o.unavailable || [401,403,429].includes(o.status) || o.status>=500) return 'unknown';
  return o.status===expected && record(o.data) ? 'pass' : 'fail';
}
export function evaluateRoute(spec, common, own) {
  const checks=[], gaps=[];
  const check=(id,ok)=>checks.push({id,state:ok===null?'unknown':ok?'pass':'fail'});
  for (const name of ['openapi','catalog']) checks.push({id:name+'_http',state:observation(common[name],200)});
  const op=common.openapi?.data?.paths?.['/'+spec.id]?.post;
  if (observation(common.openapi,200)==='pass') {
    const p=op?.['x-payment-info'];
    check('openapi_payment',p?.version===2&&p.protocol==='x402'&&p.scheme==='exact'&&p.price==='$0.01'&&p.network===offers.payment_policy.network&&address(p.payTo,offers.payment_policy.payTo)&&address(p.bazaar_indexing?.asset_contract,offers.payment_policy.asset));
    check('request_contract',contractMatches(op?.requestBody?.content?.['application/json']?.schema,spec.request_schema,common.openapi.data));
    check('response_contract',contractMatches(op?.responses?.['200']?.content?.['application/json']?.schema,spec.response_schema,common.openapi.data));
    check('buyer_input_example',matchesPinnedSchema(spec.example_request,spec.request_schema));
    const example=op?.responses?.['200']?.content?.['application/json']?.example;
    if (!matchesPinnedSchema(example,spec.response_schema)) gaps.push('openapi_output_example_missing_or_incomplete');
  }
  if (observation(common.catalog,200)==='pass') {
    const list=common.catalog.data.offers;
    const item=Array.isArray(list)?list.find(x=>x?.id===spec.id):null;
    check('catalog_terms',!!item&&item.endpoint===spec.resource&&item.method==='POST'&&item.price?.atomic_amount==='10000'&&item.price?.network===offers.payment_policy.network&&address(item.payment?.recipient,offers.payment_policy.payTo));
  }
  checks.push({id:'unpaid_http',state:observation(own.challenge,402)});
  if (observation(own.challenge,402)==='pass') {
    let ch;
    try { ch=decodeChallenge(own.challenge.payment_required); } catch { check('challenge_decode',false); }
    if (ch) {
      check('challenge_terms',ch.x402Version===2&&ch.resource?.url===spec.resource&&Array.isArray(ch.accepts)&&ch.accepts.length===1&&validTerms(ch.accepts[0]));
      const echo=own.challenge.data.payment_required ?? (record(own.challenge.data.resource)?own.challenge.data:null);
      const pick=x=>({x402Version:x.x402Version,resource:x.resource,accepts:x.accepts,extensions:x.extensions});
      if (echo!==null) check('challenge_body_continuity',record(echo)&&same(pick(ch),pick(echo)));
      else gaps.push('challenge_body_echo_absent_header_is_authoritative');
      const extension=ch.extensions?.bazaar;
      if (!record(extension?.info)||!record(extension?.schema)) gaps.push('bazaar_extension_missing');
      const input=extension?.info?.input;
      if (input?.type!=='http'||input.method!=='POST'||input.bodyType!=='json'||!record(input.body)||!Object.keys(input.body).length||!matchesPinnedSchema(input.body,spec.request_schema)) gaps.push('bazaar_input_example_missing_or_incomplete');
      if (!matchesPinnedSchema(extension?.info?.output?.example,spec.response_schema)) gaps.push('bazaar_output_example_missing_or_incomplete');
    }
  }
  if(observation(common.discovery,200)==='pass') {
    const rows=common.discovery.data.resources;
    const entry=Array.isArray(rows)?rows.find(x=>x?.resource===spec.resource):null;
    if(!entry || entry.x402Version!==2 || !Array.isArray(entry.accepts) || entry.accepts.length!==1 || !validTerms(entry.accepts[0])) gaps.push('local_discovery_terms_missing_or_changed');
    if(!matchesPinnedSchema(entry?.metadata?.output?.example,spec.response_schema)) gaps.push('local_discovery_output_example_missing_or_incomplete');
  } else gaps.push('local_discovery_unavailable');
  const v=own.validator?.data;
  const validation=observation(own.validator,200)==='pass' ? validValidation(v)?'accepted':v?.valid===false||v?.simulation?.outcome==='rejected'?'rejected':'unknown' : 'unknown';
  let indexing='unknown';
  if(observation(own.validator,200)==='pass') {
    if(v.index===null) indexing='not_indexed';
    else if(record(v.index)&&typeof v.index.active==='boolean') indexing=v.index.active?'active':'inactive';
  }
  const state=checks.some(x=>x.state==='fail')?'blocked':checks.some(x=>x.state==='unknown')?'unknown':'unpaid_checks_passed';
  return {id:spec.id,resource:spec.resource,payment_readiness:state,checks,official_validation:validation,validator_observation:{valid:typeof v?.valid==='boolean'?v.valid:null,status_code:Number.isInteger(v?.statusCode)?v.statusCode:null,version:Number.isInteger(v?.x402Version)?v.x402Version:null,simulation:['accepted','rejected'].includes(v?.simulation?.outcome)?v.simulation.outcome:null,preflight:Array.isArray(v?.preflight)?v.preflight.slice(0,20).map(x=>({check:typeof x?.check==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(x.check)?x.check:null,passed:typeof x?.passed==='boolean'?x.passed:null,severity:['required','optional','recommended'].includes(x?.severity)?x.severity:null})):null},bazaar_index:indexing,metadata_gaps:gaps,paid_delivery_verified:false,new_external_revenue_verified:false};
}
export async function collectAll({fetchImpl=fetch,validate=false}={}) {
  const allowedGet=new Set(Object.entries(URLS).filter(([k])=>k!=='validator').map(([,v])=>v));
  const resources=new Set(offers.services.map(x=>x.resource));
  async function request(url,method='GET',body) {
    if (!(method==='GET'&&allowedGet.has(url) || method==='POST'&&(resources.has(url)||url===URLS.validator&&resources.has(body?.resource)&&body.method==='POST'))) throw new Error('URL_NOT_ALLOWED');
    let status=null;
    try {
      const res=await fetchImpl(url,{method,redirect:'error',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(20000),headers:{Accept:'application/json','User-Agent':'KG-NINJA-revenue-windows/1.0 (synthetic; no payment)',...(method==='POST'?{'Content-Type':'application/json','X-KG-Traffic-Class':'synthetic_probe'}:{})},...(method==='POST'?{body:JSON.stringify(body)}:{})});
      status=res.status;
      if(res.redirected) throw new Error('REDIRECT_REFUSED');
      const size=res.headers.get('content-length');
      if(size&&(!/^\d+$/.test(size)||Number(size)>1048576)) {await res.body?.cancel();throw new Error('BODY_LIMIT');}
      const reader=res.body?.getReader();if(!reader)throw new Error('EMPTY_BODY');
      let bytes=0;const chunks=[];
      try {for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>1048576){await reader.cancel();throw new Error('BODY_LIMIT');}chunks.push(value);}}finally{reader.releaseLock();}
      const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
      return {status,data,...(resources.has(url)?{payment_required:res.headers.get('PAYMENT-REQUIRED')}:{})};
    } catch {return {status,unavailable:true};}
  }
  const common={},individual={};
  // Bound traffic: 5 shared GETs plus one unsigned POST per route; validation is opt-in.
  for(const [key,url] of Object.entries(URLS)) if(key!=='validator') common[key]=await request(url);
  for(const spec of offers.services) {
    individual[spec.id]={challenge:await request(spec.resource,'POST',spec.example_request)};
    if(validate) individual[spec.id].validator=await request(URLS.validator,'POST',{resource:spec.resource,method:'POST'});
  }
  return {common,individual};
}
export function makeReport(observed,now=new Date().toISOString()) {
  const routes=offers.services.map(s=>evaluateRoute(s,observed.common,observed.individual[s.id]||{}));
  const h=observed.common.avu;
  const health=h?.data;
  const healthState=observation(h,200);
  const timestamp=Date.parse(health?.time);
  const age=Date.parse(now)-timestamp;
  const avuFresh=Number.isFinite(age)&&age>=-60000&&age<=300000;
  const avuOkay=healthState==='pass'&&avuFresh&&health.status==='ok'&&health.checks?.cost_basis_fresh===true&&health.checks?.runtime_enabled===true&&health.checks?.payments_enabled===true;
  const safeObservation=o=>({status:o?.status??null,unavailable:!o||o.unavailable===true,...(record(o?.data)?{body_sha256:hash(o.data)}:{})});
  return {schema_version:'hyperxosist/revenue-windows-audit/1.0',checked_at:now,counts:{routes:routes.length,unpaid_ready:routes.filter(x=>x.payment_readiness==='unpaid_checks_passed').length,indexed:routes.filter(x=>x.bazaar_index==='active').length,validator_accepted:routes.filter(x=>x.official_validation==='accepted').length},routes,
    avu:{promoted:false,health:healthState==='pass'?health.status??'unknown':'unknown',fresh_health_observed:avuFresh,cost_basis_fresh:typeof health?.checks?.cost_basis_fresh==='boolean'?health.checks.cost_basis_fresh:null,next_action:avuOkay?'Review quote and signed delivery separately; health alone is not a paid E2E.':'Keep outside the active catalog; refresh verified cost basis in the authorized seller environment and recheck health.'},
    observations:{common:Object.fromEntries(Object.entries(observed.common).map(([k,v])=>[k,safeObservation(v)])),routes:Object.fromEntries(Object.entries(observed.individual).map(([id,row])=>[id,Object.fromEntries(Object.entries(row).map(([k,v])=>[k,safeObservation(v)]))]))},
    safety:{payment_sent:false,wallet_accessed:false,price_changed:false,seller_deployed:false,synthetic_probe:true},boundary:'Unpaid protocol validation is not settlement, paid delivery, customer identity, or new revenue. Indexing is measured per resource; missing is not active.'};
}
export async function main(args=process.argv.slice(2)) {
  let live=false,validate=false,out;
  for(let i=0;i<args.length;i++) {
    if(args[i]==='--live')live=true;
    else if(args[i]==='--validate')validate=true;
    else if(args[i]==='--out'&&args[i+1]&&!args[i+1].startsWith('--'))out=args[++i];
    else throw new Error('INVALID_ARGUMENTS');
  }
  if(!live)throw new Error('LIVE_OPT_IN_REQUIRED');
  const report=makeReport(await collectAll({validate}));
  const text=JSON.stringify(report,null,2)+'\n';
  if(out){await mkdir(dirname(resolve(out)),{recursive:true});await writeFile(resolve(out),text,{mode:0o600});}
  process.stdout.write(text);
  return report.routes.some(x=>x.payment_readiness==='blocked'||x.official_validation==='rejected')?1:report.routes.some(x=>x.payment_readiness==='unknown'||x.official_validation==='unknown')?2:0;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) main().then(code=>{process.exitCode=code;}).catch(()=>{console.error('REVENUE_WINDOWS_AUDIT_FAILED: --live [--validate] [--out path]. No payment performed.');process.exitCode=3;});
