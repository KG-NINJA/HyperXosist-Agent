---
layout: null
title: API購入準備 — KG-NINJA
---
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="既存5つのx402 APIの入力をブラウザ内で確認し、承認した1回の購入コマンドを準備。価格は1回0.01 USDC。自動送金・入力のアップロードはしません。">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; form-action 'none'; base-uri 'none'; object-src 'none'">
<title>API購入準備 — KG-NINJA</title>
<link rel="canonical" href="https://kg-ninja.github.io/HyperXosist-Agent/first-purchase.html">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="assets/purchase-preparer.css">
<script type="module" src="assets/purchase-preparer.mjs"></script>
</head>
<body>
<header><a class="brand" href="./">KG-NINJA / AGENT APIs</a><nav><a href="services.html">5つのAPIの仕様</a> · <a href="https://api.kgninja.dev/openapi.json" target="_blank" rel="noopener noreferrer">ライブ仕様</a></nav></header>
<main>
<section class="intro">
<div class="eyebrow">PREPARE ONE REQUEST · NO AUTO PAYMENT</div>
<h1>必要な処理を、1回だけ。</h1>
<p class="lead">用途と入力を確認し、既存ウォレットで実行する購入コマンドを作成します。ここでの準備は無料です。</p>
<p class="privacy">入力はこのタブ内で処理します。自動送信・保存・アクセス解析はしません。ウォレットの接続や署名はこの画面では行いません。</p>
</section>
<noscript><p class="notice">JavaScriptが無効です。<a href="services.html">静的な購入ガイド</a>と<a href="service-offers.json">機械向け仕様</a>をご利用ください。</p></noscript>
<p id="load-status" class="notice" role="status">購入仕様を読み込んでいます…</p>
<div class="workspace" id="preparer" hidden>
<div>
<section class="panel" aria-labelledby="input-title">
<h2 id="input-title"><span class="step">1</span>用途を選び、入力を確認</h2>
<label class="label" for="service">利用するAPI</label>
<select id="service">
<option value="fix-error">コマンドエラー診断 / Command error triage</option>
<option value="hyperxosist-query">X検索クエリ作成 / X query builder</option>
<option value="summarize-url">公開ページの抜粋 / Public page excerpt</option>
<option value="shell-risk-check">コマンド事前確認 / Shell precheck</option>
<option value="agent-visibility-report">本サービスの発見状況 / Service telemetry</option>
</select>
<p id="purpose" class="hint"></p>
<div class="row"><a id="preview" class="secondary-link" href="https://api.kgninja.dev/fix-error/preview" target="_blank" rel="noopener noreferrer">無料サンプル・仕様を見る ↗</a><button id="example" type="button">入力例を入れる</button></div>
<label class="label" for="request">送信するJSON</label>
<textarea id="request" rows="8" maxlength="16384" spellcheck="false" autocomplete="off" placeholder="入力例から始めて、自分のタスクに合わせて書き換えてください。" aria-describedby="input-feedback"></textarea>
<p id="input-feedback" class="notice" role="status" aria-live="polite">入力例から始められます。</p>
<p class="hint">「入力例」は自分のタスクの診断結果ではありません。秘密情報・個人情報を除いてください。検出できない認証情報もあるため、必ず自分でも確認してください。</p>
</section>
<section class="panel" aria-labelledby="output-title">
<h2 id="output-title">購入後に受け取るもの</h2>
<p id="output-help" class="result-card"></p>
<p id="limitations" class="hint"></p>
<p id="alternative" class="hint"></p>
<p class="hint">結果は提案・抽出内容です。返されたコマンドを自動実行しないでください。決済確定と結果受領は別々に確認します。</p>
</section>
</div>
<aside class="panel" aria-labelledby="review-title">
<h2 id="review-title"><span class="step">2</span>この1回の購入条件</h2>
<div class="price">0.01 USDC <small>/ 1リクエスト</small></div>
<span class="tag">Base Mainnet · x402 v2</span>
<p class="hint">現在の公開仕様に基づく購入上限です。実行時の402要求が異なれば止め、値を勝手に変更しないでください。</p>
<dl class="terms"><dt>Method</dt><dd>POST</dd><dt>API</dt><dd><code id="endpoint"></code></dd><dt>Network</dt><dd>eip155:8453</dd><dt>USDC</dt><dd><code>0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913</code></dd><dt>受取先</dt><dd><code>0x4D7d842536De9Eb491AE2300126B3CDdE7B0aDE3</code></dd></dl>
<label class="label" for="prior-outcome">この要求の支払い状況</label>
<select id="prior-outcome"><option value="not_started">まだ支払いを始めていない</option><option value="unknown">支払った／結果が不明 — 再購入しない</option></select>
<label class="check"><input id="reviewed" type="checkbox"><span>送信内容を確認しました。実行する場合は、ウォレットでこの1回の最大0.01 USDCを承認し、金額・ネットワーク・資産・受取先を照合します。</span></label>
<button id="prepare" class="primary wide" type="button" disabled>購入コマンドを準備する</button>
<p class="hint">このボタンでは支払いもAPI呼び出しも行いません。</p>
<div id="prepared" hidden>
<h3>3. ウォレットのある環境で実行</h3>
<p class="hint">以下はBash / zsh用です。<strong>実行すると実USDCを支払います。</strong> 認証済み・残高のある公式Agentic Wallet CLIが必要です。</p>
<pre id="command" tabindex="0" aria-label="購入コマンド"></pre>
<div class="row"><button id="copy-command" class="primary" type="button">コマンドをコピー</button><button id="save-plan" type="button">Agent用JSONを保存</button></div>
<p id="action-feedback" class="hint" role="status" aria-live="polite"></p>
<p class="hint">上限は1回分です。CLIの上限オプションだけでは、受取先・資産・ネットワーク・合計予算を固定できません。自動運用ではウォレット側の制御が別途必要です。JSONには入力内容が含まれます。</p>
</div>
<details class="detail"><summary>ウォレットが未準備の場合</summary><p>このサイトはカード決済や秘密鍵入力に対応していません。<a href="https://docs.cdp.coinbase.com/agentic-wallet/cli/skills/pay-for-service" target="_blank" rel="noopener noreferrer">公式CLIの設定手順</a>を確認してください。無人運用ではレビューしたバージョンを固定します。</p></details>
</aside>
</div>
<section class="recovery" id="recovery" aria-labelledby="recovery-title"><h2 id="recovery-title">402やタイムアウトで、何度も払わない。</h2><p>最初の402は料金提示です。同じ未払い要求を繰り返しても購入には進みません。署名付き要求の送信後に結果が不明になった場合は、新しい署名や購入を作らず、元の支払いと納品結果を照合します。入力を変えた場合も自動で再購入しません。</p><p>元の入力・request ID・応答・ウォレットの決済証跡を非公開で保管してください。HTTP 200、画面上の準備完了、集計増加だけでは、決済確定や正常納品を証明できません。この画面の支払い状況は自己申告で、再読込をまたぐ二重払い防止機能ではありません。</p><a href="services.html">結果の読み方と全サービスの詳細</a></section>
</main>
<footer>入力確認はローカルの補助機能です。API側の検証・ウォレット承認を置き換えません。<a href="service-offers.json">機械向け仕様</a> · <a href="https://api.kgninja.dev/buy" rel="noreferrer">売り手APIの案内</a></footer>
</body>
</html>
