# HyperXosist Agent (X Search Launcher) v2

X (旧Twitter) の**高度な検索演算子**を視覚的に組み立て、公式の検索結果ページを素早く開く超軽量 Web ツールです。  
人間のブラウザ利用は無料。AI エージェントは `agent-use.json` + x402 経由の有料パスを利用します。

**Live:** https://kg-ninja.github.io/HyperXosist-Agent/

## v2 の主な進化点

| 領域 | 内容 |
|------|------|
| **演算子** | `to:`, `@mention`, `min_retweets`, `min_replies`, OR グループ (`anyOf`), ハッシュタグ, `url:`, 返信/認証/引用/メディア系 filter, 生演算子 |
| **テンプレート** | Product feedback / Competitor / News / AI discourse / 日本語トレンド / Media / Clean original / Signal-to-Fix 連携 |
| **単一ソース** | UI (`app.js`) は `agent-api.js` の `HyperXosistAgent` を唯一のクエリ生成実装として利用 |
| **検証・解説** | `validateInput` / `analyzeQuery` / `explainQuery` / 文字数・除外語数メタ表示 |
| **共有** | フォーム状態を URL ハッシュ `#s=...` にエンコードして共有・復元 |
| **バッチ** | `buildBatch(inputs[])` で複数クエリを一括生成 |
| **日付** | 24h / 7d / 30d / 90d / 1y プリセット |
| **テスト** | 依存ゼロの Node テスト `node test/agent-api.test.js` |

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

```js
// Browser or Node (require agent-api.js)
const input = HyperXosistAgent.applyTemplate('signal_to_fix', {
  keywords: 'my-product'
});
const paid = HyperXosistAgent.buildPaidRequest(input);
// POST paid.body → paid.endpoint  (expect 402 until x402 payment)
// After payment, use returned query / search URL
```

- エージェントは `agent-use.json` と `x402-payment.json` を読む
- 支払い前に `buildQuery` / `buildSearchUrl` の結果を**自動業務で利用しない**（ローカル検証・プレビューのみ）
- エンドポイント: `https://kg-ninja-x402-revenue-gate-mainnet-staging.fuwafuwow.workers.dev/hyperxosist-query`
- Signal-to-Fix 連動: https://kg-ninja.github.io/Signal-to-Fix/

### 主要 API（v2）

| Method | 説明 |
|--------|------|
| `buildQuery(input)` | X 検索クエリ文字列 |
| `buildSearchUrl(input)` | `https://x.com/search?...` |
| `buildPaidRequest(input)` | x402 POST 用ペイロード + local preview |
| `buildBatch(inputs)` | 複数入力の一括生成 |
| `validateInput(input)` | 矛盾・日付・数値チェック |
| `analyzeQuery(input\|string)` | 長さ・演算子数・警告 |
| `explainQuery(input)` | 人間可読な解説 |
| `applyTemplate(id, overrides?)` | 研究テンプレート適用 |
| `applyDatePreset(key)` | `24h`/`7d`/`30d`/`90d`/`1y` |
| `listTemplates()` | テンプレート一覧 |
| `encodeState` / `decodeState` | 共有用 Base64 状態 |

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
index.html          # UI
style.css           # デザイン
app.js              # UI ロジック（agent-api を利用）
agent-api.js        # クエリ生成・テンプレート・検証（単一ソース）
agent-use.json      # エージェント向けマニフェスト
x402-payment.json   # x402 支払いメタデータ
top30_repost_blacklist.json
test/agent-api.test.js
README.md
```

## ライセンス / 免責

© 2026 HyperXosist Agent. X Corp. とは無関係です。
