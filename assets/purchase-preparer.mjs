import {validateCatalog,inspectInput,preparePurchase,ERROR_TEXT} from '../buyer-preflight.mjs';
const $=id=>document.getElementById(id);
const COPY={
  'fix-error':{purpose:'ビルド・デプロイ・コマンドの失敗から、次に確認することを整理します。',output:'receiptの中に root_cause / next_command / retry_plan / risk_note / prevention_note / generated_at が入ります。',limit:'ルールベースの提案です。リポジトリ調査・自動修復・修復の保証はありません。',alternative:'ローカルのデバッガや手元のモデルで解決できるなら、購入は不要です。',preview:'https://api.kgninja.dev/fix-error/preview'},
  'hyperxosist-query':{purpose:'検索したい内容から、フィルタ付きX検索クエリと公式検索URLを作ります。',output:'query / searchUrl / mode / appliedNoiseTerms / excludeTerms / generated_at と決済メタデータを返します。',limit:'投稿の収集、見込み客の保証、ユーザーへの連絡は行いません。',alternative:'無料dry-run、ローカルの検索計画・MCP計画も利用できます。',preview:'https://api.kgninja.dev/hyperxosist-query-dry-run'},
  'summarize-url':{purpose:'公開ページのタイトルと、最大420文字の本文抜粋を取得します。',output:'status / title / summary / url。summaryは抽出テキストであり、AIによる要約文ではありません。',limit:'ログインやブラウザ描画は行いません。入力先が公開URLであることを確認してください。',alternative:'ページを直接読めば足りる場合は、購入は不要です。',preview:'https://api.kgninja.dev/openapi.json'},
  'shell-risk-check':{purpose:'実行前のシェルコマンドについて、既知のパターンに基づく注意点を確認します。',output:'status / risk_level / explanation / safer_alternative。代替コマンドは自動実行しません。',limit:'包括的なセキュリティ監査・サンドボックスではありません。lowでも安全を保証しません。',alternative:'手元の静的検査で足りる場合は、購入は不要です。',preview:'https://api.kgninja.dev/openapi.json'},
  'agent-visibility-report':{purpose:'KG-NINJAサービス自身の発見状況・決済準備状況に関する集計を取得します。',output:'各種スコア、detected_gaps / recommended_next_fix / privacy などの集計レポートです。',limit:'任意のウェブサイトの監査ではありません。スコアは顧客需要や売上の証明ではありません。',alternative:'通常は公開メタデータを先に確認してください。用途が合う場合だけ購入します。',preview:'https://api.kgninja.dev/capabilities.json'}
};
let catalog=null,prepared=null;
function invalidate(){prepared=null;$('prepared').hidden=true;$('command').textContent='';$('action-feedback').textContent='';}
function refresh(){
  invalidate();
  const state=$('prior-outcome').value;
  const result=state==='not_started'?inspectInput(catalog,$('service').value,$('request').value):{ok:false,message:ERROR_TEXT.reconcile_first};
  $('input-feedback').textContent=result.ok?'入力の事前確認に合格しました。まだ送信・支払いはしていません。':result.message;
  $('input-feedback').dataset.kind=result.ok?'ok':'error';
  $('prepare').disabled=!result.ok||!$('reviewed').checked;
}
function choose(){
  const id=$('service').value,spec=catalog.services.find(s=>s.id===id),copy=COPY[id];
  $('purpose').textContent=copy.purpose;$('output-help').textContent=copy.output;
  $('limitations').textContent=copy.limit;$('alternative').textContent=copy.alternative;
  $('endpoint').textContent=spec.resource;$('preview').href=copy.preview;
  $('request').value=JSON.stringify(spec.example_request,null,2);$('reviewed').checked=false;refresh();
}
async function init(){
  try{
    const response=await fetch(new URL('../service-offers.json',import.meta.url),{credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});
    if(!response.ok||response.redirected)throw new Error();
    const reader=response.body.getReader();let bytes=0;const chunks=[];
    try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>131072){await reader.cancel();throw new Error();}chunks.push(value);}}finally{reader.releaseLock();}
    const combined=new Uint8Array(bytes);let offset=0;for(const c of chunks){combined.set(c,offset);offset+=c.length;}
    catalog=validateCatalog(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(combined)));
    choose();$('load-status').hidden=true;$('preparer').hidden=false;
  }catch{$('load-status').textContent=ERROR_TEXT.catalog_unavailable;$('load-status').dataset.kind='error';}
}
$('service').addEventListener('change',choose);
$('request').addEventListener('input',()=>{$('reviewed').checked=false;refresh();});
$('example').addEventListener('click',choose);
$('reviewed').addEventListener('change',refresh);
$('prior-outcome').addEventListener('change',()=>{$('reviewed').checked=false;refresh();});
$('prepare').addEventListener('click',()=>{
  const r=preparePurchase(catalog,$('service').value,$('request').value,{reviewed:$('reviewed').checked,priorOutcome:$('prior-outcome').value});
  if(!r.ok){invalidate();$('input-feedback').textContent=r.message;$('input-feedback').dataset.kind='error';return;}
  prepared=r;$('command').textContent=r.command;$('prepared').hidden=false;
  $('action-feedback').textContent='準備のみ完了。実行はウォレットのある環境で行ってください。';
});
$('copy-command').addEventListener('click',async()=>{
  if(!prepared)return;
  try{await navigator.clipboard.writeText(prepared.command);$('action-feedback').textContent='コピーしました。実行すると実USDCを支払います。';}
  catch{$('action-feedback').textContent='コピー権限がありません。上のコードを選択して手動でコピーしてください。';}
});
$('save-plan').addEventListener('click',()=>{
  if(!prepared)return;
  const blob=new Blob([JSON.stringify(prepared.plan,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='purchase-request.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  $('action-feedback').textContent='保存したJSONには入力内容が含まれます。非公開で保管してください。自動購入の権限は含みません。';
});
init();
