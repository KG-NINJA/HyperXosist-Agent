# HyperXosist Agent (X Search Launcher) v2.1

X (旧Twitter) の**高度な検索演算子**を視覚的に組み立て、公式の検索結果ページを素早く開く超軽量 Web ツールです。  
人間のブラウザ利用は無料。**AI エージェント向け**にはミッション計画・スコアゲート・自己修復・Signal-to-Fix ハンドオフ・tool-calling 定義を用意し、繰り返し使いやすい sticky loop を提供します。

**Live:** https://kg-ninja.github.io/HyperXosist-Agent/

## エージェントが何度も使う理由

| 機能 | 効果 |
|------|------|
| `planFromIntent` | 自然言語ゴール → マルチアングル任務（当てずっぽう検索を削減） |
| `scoreQuery` | 支払い前に 0–100 で品質判定（$0.01 の無駄撃ち防止） |
| `suggestRefinements` | 0 件 / ノイズ過多をエージェントが自己修復 |
| `buildHandoffPackage` | 収集テキストを Signal-to-Fix の keep-only PR パイプラインへ直結 |
| `buildRunReceipt` | 監査・週次 cron・状態再利用 (`encodeState`) |
| `agent-tools.json` | OpenAI/Anthropic tool-calling にそのまま載せられる |
| `llms.txt` / `AGENTS.md` | 発見から 30 秒でループに入れる |

```js
const session = HyperXosistAgent.startAgentSession({
  intent: 'Find product feedback about Acme for PR specs'
});
// → plan / tools / playbook / payment hints in one call
```

## v2.1 の進化点

| 領域 | 内容 |
|------|------|
| **Agent sticky layer** | missions, planFromIntent, score, refine, handoff, receipt, session bootstrap |
| **発見性** | `llms.txt`, `AGENTS.md`, `agent-tools.json`, `missions.json` |
| **演算子** | `to:`, `@mention`, `min_retweets`, `min_replies`, OR (`anyOf`), ハッシュタグ, `url:`, 各種 filter, 生演算子 |
| **テンプレート** | Product / Competitor / News / AI / 日本語 / Media / Clean / Signal-to-Fix |
| **単一ソース** | UI は `agent-api.js` を唯一の実装として利用 |
| **共有・検証** | `#s=` 状態共有, validate / analyze / explain |
| **テスト** | `node test/agent-api.test.js` |

## 特徴

- **X API 不要・OAuth 不要**: API キー等は一切不要
- **超軽量**: HTML / CSS / JS のみ。ビルド・パッケージ不要
- **プライバシー**: 人間操作と履歴はブラウザ localStorage。エージェント利用時のみ既存 x402 Worker へ支払い付き POST
- **Noise Reduction**: Low / Medium / High。`top30_repost_blacklist.json` 相当の高頻度リポスト定型句を Medium 以上で除外
- **AI エージェント対応**: `agent-use.json` + `agent-api.js` + `x402-payment.json`
- **国際検索**: 既定は Global（`lang:` なし）。en / ja / es / fr / de / ko / zh

## 注意事項

- 本ツールは **X 公式検索ページを開く検索支援ツール**です
- 画面内に検索結果を埋め込んだり、自動投稿したりする機能はありません

## 使い方（人間）

1. キーワード / OR グループ / ユーザー / 日付 / エンゲージメント等を入力
2. 必要なら Research template を適用
3. Noise Reduction を ON にしてスパム・bait を除外
4. 「最新で検索」または「話題で検索」（`Ctrl+Enter` / `Ctrl+Shift+Enter`）
5. コピー / 検索 URL コピー / 状態共有リンク / 解説を利用

## AI エージェント利用と x402

**発見順:** [llms.txt](https://kg-ninja.github.io/HyperXosist-Agent/llms.txt) → [AGENTS.md](https://kg-ninja.github.io/HyperXosist-Agent/AGENTS.md) → [agent-use.json](https://kg-ninja.github.io/HyperXosist-Agent/agent-use.json)

```js
// Sticky loop (Node or browser with agent-api.js)
const plan = HyperXosistAgent.planFromIntent(
  'Find product feedback about Acme for PR specs'
);
const step = plan.primaryStep;
if (step.score.recommendPay) {
  const paid = step.paidRequest;
  // POST paid.body → paid.endpoint  (402 until x402 payment)
  // collect post texts from step.searchUrl after authorization
}
const handoff = HyperXosistAgent.buildHandoffPackage({
  productName: 'Acme',
  feedback: ['...candidate posts...']
});
// → handoff.signalToFix.input into Signal-to-Fix (keep-only only)
```

- 支払い前の `buildQuery` / `buildSearchUrl` は**計画・プレビューのみ**（本番自動利用は x402）
- エンドポイント: `.../hyperxosist-query`（詳細は `x402-payment.json`）
- Signal-to-Fix: https://kg-ninja.github.io/Signal-to-Fix/

### 主要 API（v2.1）

| Method | 説明 |
|--------|------|
| `startAgentSession(opts?)` | playbook + tools + optional plan を一括取得 |
| `planFromIntent(intent)` | NL → ミッション + paid steps + nextActions |
| `buildMission(id, ctx)` | 名前付きマルチアングル任務 |
| `composeCampaign(opts)` | 多言語・多ゴール横断 |
| `scoreQuery(input)` | 0–100 品質スコア / recommendPay |
| `suggestRefinements(input, signals)` | 疎・ノイズ時の自己修復候補 |
| `buildHandoffPackage(opts)` | Signal-to-Fix 向け JSON |
| `buildRunReceipt(opts)` | 監査・再利用レシート |
| `getToolDefinitions()` | OpenAI 互換 tools |
| `buildQuery` / `buildSearchUrl` | 単一クエリ生成 |
| `buildPaidRequest` / `buildBatch` | x402 ペイロード |
| `applyTemplate` / `listMissions` / `listTemplates` | カタログ |
| `encodeState` / `decodeState` | 状態共有 |

## 開発・テスト

```bash
# 依存なし
node test/agent-api.test.js
```

静的サーバで UI 確認:

```bash
npx --yes serve -l 5173 .
# open http://localhost:5173
```

## 公開連携テスト（期待 PASS）

- `https://kg-ninja.github.io/HyperXosist-Agent/` がロードできる
- `agent-use.json` / `x402-payment.json` が JSON として読める
- `agent-use.json` が Signal-to-Fix の `agent-use.json` へリンクしている
- 未払い `POST .../hyperxosist-query` → `402`

## デプロイ (GitHub Pages)

1. `main` にプッシュ
2. Settings → Pages → Deploy from a branch → `main` / `(root)`
3. `https://<user>.github.io/HyperXosist-Agent/` で公開

## ファイル構成

```
index.html              # Human UI
style.css
app.js                  # UI（agent-api 利用）
agent-api.js            # 単一ソース API v2.1
agent-use.json          # エージェント向けマニフェスト（sticky loop）
agent-tools.json        # OpenAI 互換 tool definitions
missions.json           # ミッションカタログ
llms.txt                # LLM 発見用
AGENTS.md               # エージェント手順書
x402-payment.json
top30_repost_blacklist.json
test/agent-api.test.js
README.md
```

## ライセンス / 免責

© 2026 HyperXosist Agent. X Corp. とは無関係です。
