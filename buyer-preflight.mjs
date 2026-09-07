// Local preparation only: no fetch, wallet, storage, signing or command execution.
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const freeze = x => { if (x && typeof x === 'object') { Object.values(x).forEach(freeze); Object.freeze(x); } return x; };
export const POLICY = freeze({network:'eip155:8453',asset:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',payTo:'0x4D7d842536De9Eb491AE2300126B3CDdE7B0aDE3',amount:'10000',scheme:'exact',version:2});
export const SERVICE_IDS = Object.freeze(['fix-error','summarize-url','shell-risk-check','agent-visibility-report','hyperxosist-query']);
const MAX_BYTES = 16384;
export const ERROR_TEXT = Object.freeze({
  invalid_json:'JSONの書式を確認してください。 / Invalid JSON.',
  object_required:'入力はJSONオブジェクトにしてください。 / Use a JSON object.',
  input_too_large:'入力は16 KiB以内にしてください。 / Maximum 16 KiB.',
  schema_mismatch:'未対応の項目、値の型、必須項目を確認してください。 / Check fields and types.',
  secret_detected:'認証情報らしい値を削除してください。自動マスクはしません。 / Remove credentials.',
  public_url_required:'認証情報を含まない公開HTTP(S)ページを指定してください。 / Public URL only.',
  failure_evidence_required:'errorまたはlogに、実際の失敗内容を入力してください。 / Add error evidence.',
  empty_command:'確認するcommandを入力してください。 / Add a command.',
  empty_keywords:'検索したいkeywordsを入力してください。 / Add keywords.',
  invalid_numeric_filter:'minFaves / minRetweetsは0以上の整数にしてください。 / Nonnegative integers only.',
  aggregate_only:'このレポートは本サービスの集計専用です。target_urlは使用できません。 / Service aggregate only.',
  approval_required:'送信する内容と、この1回の購入条件を確認してください。 / Review before preparing.',
  reconcile_first:'前の決済・結果を照合するまで、新しい購入を作成しません。 / Reconcile first.',
  catalog_unavailable:'購入仕様を確認できません。ライブ仕様と運用担当者に確認してください。 / Contract unavailable.'
});
const fail = code => ({ok:false,code,message:ERROR_TEXT[code]});
const sameAddress = (a,b) => typeof a==='string' && a.toLowerCase()===b.toLowerCase();
export function validateCatalog(catalog) {
  const p=catalog?.payment_policy;
  if(!record(catalog)||!record(p)||p.protocol!=='x402'||p.version!==2||p.scheme!=='exact'||p.network!==POLICY.network||
    !sameAddress(p.asset,POLICY.asset)||!sameAddress(p.payTo,POLICY.payTo)||p.amount!==POLICY.amount||p.decimals!==6||p.automatic_purchase!==false||
    !Array.isArray(catalog.services)||catalog.services.length!==SERVICE_IDS.length) throw new Error('catalog_unavailable');
  for(const id of SERVICE_IDS){
    const found=catalog.services.filter(s=>s?.id===id);
    if(found.length!==1||found[0].resource!==`https://api.kgninja.dev/${id}`||found[0].method!=='POST'||
      !record(found[0].request_schema)||found[0].request_schema.type!=='object'||found[0].request_schema.additionalProperties!==false) throw new Error('catalog_unavailable');
  }
  return freeze(structuredClone(catalog));
}
function matches(value,schema,depth=0) {
  if(depth>12||!record(schema))return false;
  // Only the current first-party request-schema subset; unknown keywords fail closed.
  const allowed=['type','properties','required','additionalProperties','items','format','pattern','minimum','enum'];
  if(Object.keys(schema).some(k=>!allowed.includes(k)))return false;
  const types=Array.isArray(schema.type)?schema.type:[schema.type];
  const isType=t=>t==='object'?record(value):t==='array'?Array.isArray(value):t==='integer'?Number.isSafeInteger(value):t==='number'?typeof value==='number'&&Number.isFinite(value):typeof value===t;
  if(!types.some(isType))return false;
  if(schema.enum&&(!Array.isArray(schema.enum)||!schema.enum.includes(value)))return false;
  if(record(value)){
    if((schema.required||[]).some(k=>!Object.hasOwn(value,k)))return false;
    for(const [k,v] of Object.entries(value)){
      if(['__proto__','prototype','constructor'].includes(k))return false;
      if(Object.hasOwn(schema.properties||{},k)){if(!matches(v,schema.properties[k],depth+1))return false;}
      else return false; // This preparer intentionally accepts only documented fields.
    }
  }
  if(Array.isArray(value)&&(!schema.items||value.length>100||!value.every(v=>matches(v,schema.items,depth+1))))return false;
  if(typeof value==='number'&&schema.minimum!==undefined&&value<schema.minimum)return false;
  if(typeof value==='string'){
    if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))return false;
    if(schema.pattern){if(schema.pattern!=='^[a-z]{2}$'||!/^[a-z]{2}$/.test(value))return false;}
    if(schema.format){if(schema.format!=='uri')return false;try{new URL(value);}catch{return false;}}
  }
  return true;
}
function sensitive(text) {
  return /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+\/-]{8,}|\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}|\b(?:api[_-]?key|access[_-]?token|password|payment[-_]?signature|private[_-]?key)\s*[:=]\s*["']?[^\s"',}{]{8,}/i.test(text);
}
// Called only after the bounded known schema passes. Never echo matched values.
function sensitiveTree(value,depth=0) {
  if(depth>12)return true;
  if(typeof value==='string')return sensitive(value);
  if(Array.isArray(value))return value.some(v=>sensitiveTree(v,depth+1));
  if(record(value))return Object.values(value).some(v=>sensitiveTree(v,depth+1));
  return false;
}
function publicUrl(value) {
  try{
    const u=new URL(value),h=u.hostname.toLowerCase();
    if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.hash)return false;
    if(!h.includes('.')||h.startsWith('[')||/^\d+(\.\d+){3}$/.test(h)||/(?:^|\.)(?:localhost|local|internal|lan|test|invalid)$/.test(h))return false;
    if([...u.searchParams.keys()].some(k=>/(?:token|secret|password|signature|api.?key|authorization|^sig$)/i.test(k)))return false;
    return true;
  }catch{return false;}
}
export function inspectInput(catalog,id,text) {
  let data;
  try { data=validateCatalog(catalog); } catch { return fail('catalog_unavailable'); }
  const offer=data.services.find(s=>s.id===id);if(!offer)return fail('catalog_unavailable');
  if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_BYTES)return fail('input_too_large');
  let input;try{input=JSON.parse(text);}catch{return fail('invalid_json');}
  if(!record(input))return fail('object_required');
  if(!matches(input,offer.request_schema))return fail('schema_mismatch');
  if(sensitiveTree(input))return fail('secret_detected');
  if(id==='fix-error'&&![input.error,input.log].some(v=>typeof v==='string'&&v.trim()))return fail('failure_evidence_required');
  if(id==='shell-risk-check'&&!input.command?.trim())return fail('empty_command');
  if(id==='summarize-url'&&!publicUrl(input.url))return fail('public_url_required');
  if(id==='agent-visibility-report'&&(Object.hasOwn(input,'target_url')||input.mode!==undefined&&input.mode!=='aggregate'))return fail('aggregate_only');
  if(id==='hyperxosist-query'){
    if(!input.keywords?.trim())return fail('empty_keywords');
    for(const key of ['minFaves','minRetweets'])if(Object.hasOwn(input,key)&&!(typeof input[key]==='number'?Number.isSafeInteger(input[key])&&input[key]>=0:/^(0|[1-9]\d{0,14})$/.test(input[key])))return fail('invalid_numeric_filter');
  }
  return {ok:true,input,body:JSON.stringify(input),service:id,resource:offer.resource};
}
export function shellQuote(value) {
  if(typeof value!=='string'||value.includes('\0'))throw new Error('invalid_shell_value');
  return "'"+value.replace(/'/g,"'\\''")+"'";
}
export function preparePurchase(catalog,id,text,{reviewed=false,priorOutcome='not_started'}={}) {
  if(priorOutcome!=='not_started')return fail('reconcile_first');
  const checked=inspectInput(catalog,id,text);if(!checked.ok)return checked;
  if(reviewed!==true)return fail('approval_required');
  const argv=['npx','awal@latest','x402','pay',checked.resource,'--method','POST','--data',checked.body,'--max-amount',POLICY.amount,'--json'];
  return {ok:true,command:argv.map(shellQuote).join(' '),plan:{
    schema_version:'hyperxosist/purchase-preparation/1.0',service:id,
    request:{url:checked.resource,method:'POST',headers:{'Content-Type':'application/json'},body:checked.input},
    expected_terms:{...POLICY},
    authorization:{granted:false,local_review_recorded:true,live_challenge_review_required:true,wallet_owner_approval_required:true},
    execution:{automatic:false,payment_sent:false,argv},
    retry_policy:{repeat_unsigned_402:false,automatic_repurchase:false,unknown_outcome:'stop_and_reconcile'},
    warning:'This file contains your input. Keep it private. Preparation and the CLI cap do not enforce wallet recipient/network/asset policy, provide idempotency, or prove settlement.'
  }};
}
