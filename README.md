# X Search Launcher (X検索ランチャー)

X (旧Twitter) の高度な検索演算子を視覚的に組み立てて、公式の検索結果ページを素早く開くための超軽量Webツールです。

## 特徴
- **X API不要・OAuth不要**: APIキー、Bearer Token、CLIENT_SECRET等は一切不要です。
- **超軽量・高速起動**: HTML/CSS/JavaScriptのみの静的ファイル構成で、ビルドやライブラリのインストールも必要ありません。
- **プライバシー配慮**: すべての処理はブラウザ上で完結し、最近のクエリ履歴もローカルストレージ（localStorage）のみに保存されます。外部サーバーへの通信は発生しません。
- **Noise Reduction**: Low / Medium / High のプリセットで明らかなスパム・釣り・宣伝ノイズの除外語を検索クエリへ自動追加できます。英語圏の engagement bait / promo spam にも対応し、手入力の除外ワードは保持されます。`top30_repost_blacklist.json` の高頻度リポスト系フレーズもMedium以上で除外します。
- **AIエージェント対応**: `agent-use.json` と `agent-api.js` を公開し、AIエージェントが機械可読にクエリ生成仕様を使えます。エージェント利用は `x402-payment.json` の既存x402エンドポイントで課金する前提です。
- **国際検索対応**: 既定は `lang:` を付けない Global 検索です。English / Japanese / Spanish / French / German / Korean / Chinese を選択できます。
- **レスポンシブデザイン**: スマートフォンとPCの双方に最適化されたダークモード基調のUI。

## 注意事項（免責事項）
- 本ツールは**X公式検索ページを開く検索支援ツール**です。
- X APIを使用していないため、**本ツールの画面内に検索結果を表示したり、自動投稿を行ったりする機能はありません**。

## 使い方
1. 入力フォームにキーワードや除外ワード、日付、最小いいね数、フィルター等の検索条件を入力します。英語検索では Language を English、または国際横断なら Global のまま使います。
2. 条件の入力に合わせて、「生成されたクエリ」エリアにX検索用コマンドがリアルタイムに組み立てられます。
3. 必要に応じて Noise Reduction をONにし、英語圏の spam / engagement bait / promo noise を検索前に除外します。
4. 「最新で検索」または「話題で検索」ボタンをクリックすると、新規タブでXの公式検索画面が開きます。
5. コピーボタンで組み立てられたクエリテキストのみをクリップボードに取得することも可能です。


## AIエージェント利用とx402
- エージェントは `agent-use.json` を読み、`agent-api.js` の `HyperXosistAgent.buildQuery(input)` または `buildSearchUrl(input)` を使えます。
- AIエージェントによる自動利用・商用利用は x402 支払い対象です。
- `x402-payment.json` は `https://kg-ninja-x402-revenue-gate-mainnet-staging.fuwafuwow.workers.dev/hyperxosist-query` のHyperXosist専用x402 paid routeへ接続済みです。
- GitHub Pagesは静的配信のため、支払い検証・settlement・wallet・priceは既存x402 Worker側で扱います。AIエージェントは `x402-payment.json` の `paymentEndpoint` にPOSTし、未払い402を受け取ってからx402支払い付きで再試行します。
## デプロイ方法 (GitHub Pagesへの公開)
本リポジトリはビルドが不要なため、そのままGitHub Pagesで公開することができます。

1. 本プロジェクトのファイル一式をGitHubリポジトリにプッシュします。
2. リポジトリの `Settings` > `Pages` に移動します。
3. **Build and deployment** の Source から `Deploy from a branch` を選択します。
4. Branch に `main` (または `master`) と `/ (root)` を設定し、`Save` をクリックします。
5. 数分で提供されたURL（例: `https://<username>.github.io/<repository-name>/`）で本ツールが動作します。





