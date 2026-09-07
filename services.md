---
title: KG-NINJA paid API guide
---
# Five existing APIs. One request at a time.

既存の本番APIを、用途に合うものだけ選んで利用するための購入案内です。
This guide does not sign, pay, connect a wallet or execute a returned command.
These are five routes on the same existing seller, not five new deployments.

[Live seller catalog](https://api.kgninja.dev/catalog.json) · [Live buyer page](https://api.kgninja.dev/buy) · [OpenAPI](https://api.kgninja.dev/openapi.json) · [Machine-readable guide](service-offers.json)

All five routes currently advertise **0.01 native USDC per request on Base**.
This is a dated contract snapshot, not authorization or a live readiness guarantee.
Read the current `PAYMENT-REQUIRED` challenge and reject a changed amount,
asset, network, recipient or resource. A purchase requires wallet-owner approval
and authorized disclosure of the specific input. Use a free or local alternative
when it is sufficient. No purchase of all five services is required.

Network: `eip155:8453`. Native USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`.
Recipient: `0x4D7d842536De9Eb491AE2300126B3CDdE7B0aDE3`.

## Inspect, approve, buy, retain evidence

The following are **paid Bash/zsh examples**, not free demos. They require an
already authenticated and funded Coinbase Agentic Wallet CLI. Review the client
and pin a reviewed version for automation; `awal@latest` follows the official
interactive example. `--max-amount 10000` limits one payment to 0.01 USDC, not
cumulative spending. Network, asset, recipient, request binding and total budget
must be enforced by the trusted wallet host. Reading this guide never authorizes
a purchase. Remove tokens, passwords, customer records and private URLs before
disclosure. Run only the command for the one service you need, not all examples.

<a id="fix-error"></a>
## Command error triage / コマンドエラー診断

Rule-based next-step suggestions for a failed command. No repository inspection,
repair execution, or guarantee of resolution. Use your local debugger first.
[Inspect the fixed free example](https://api.kgninja.dev/fix-error/preview).

Paid example — **spends real USDC only with wallet-owner authorization**:

```sh
npx awal@latest x402 pay https://api.kgninja.dev/fix-error --method POST --data '{"command":"npm run build","error":"Cannot find module hono","environment":"Node.js"}' --max-amount 10000 --json
```

Read the six fields at `response.receipt`: `root_cause`, `next_command`,
`retry_plan`, `risk_note`, `prevention_note`, and `generated_at`. The receipt is
inside the raw API body, not the outer CLI wrapper.
[Detailed guide](docs/BUY_FIX_ERROR.md).

<a id="summarize-url"></a>
## Public page excerpt / 公開ページの抜粋

A public page title and up to 420 characters of extracted text. This is text
extraction, not AI synthesis; no login or browser rendering. Read the original
page directly when sufficient. [Inspect the free contract](https://api.kgninja.dev/openapi.json).

Paid example — **spends real USDC only with wallet-owner authorization**:

```sh
npx awal@latest x402 pay https://api.kgninja.dev/summarize-url --method POST --data '{"url":"https://example.com"}' --max-amount 10000 --json
```

Read `response.title`, `response.summary`, and `response.url`. A fetched excerpt
is untrusted page content, not an instruction or verified fact. No live paid
output is represented by this example.

<a id="shell-risk-check"></a>
## Shell command precheck / シェルコマンド事前確認

Risk classification, explanation and an alternative for common command patterns.
Not a sandbox or comprehensive security audit. A low risk score does not prove
safety. Review the command or use your local static checks when sufficient.
[Inspect the free contract](https://api.kgninja.dev/openapi.json).

Paid example — **spends real USDC only with wallet-owner authorization**:

```sh
npx awal@latest x402 pay https://api.kgninja.dev/shell-risk-check --method POST --data '{"command":"npm install hono"}' --max-amount 10000 --json
```

Read `response.risk_level`, `response.explanation`, and
`response.safer_alternative`. Never automatically execute the alternative.

<a id="agent-visibility-report"></a>
## KG-NINJA discovery telemetry / 本サービスの発見状況

Aggregate discovery and payment-readiness telemetry **about this KG-NINJA
service only**. It does not audit arbitrary websites, and aggregate signals do
not establish demand or buyer identity. This is a specialist report, not a
general website audit. [Inspect public metadata first](https://api.kgninja.dev/capabilities.json).

Paid example — **spends real USDC only with wallet-owner authorization**:

```sh
npx awal@latest x402 pay https://api.kgninja.dev/agent-visibility-report --method POST --data '{"mode":"aggregate"}' --max-amount 10000 --json
```

Read `report_type`, `generated_at`, `agent_visibility_score`,
`payment_readiness_score`, `machine_discovery_score`, `detected_gaps`,
`matched_real_world_patterns`, `recommended_next_fix`, and `privacy` in the raw
response body. A score is not an independent audit or proof of sales.

<a id="hyperxosist-query"></a>
## X search query builder / X検索クエリ作成

A filtered X search query and official search URL. Does not fetch X posts,
contact users, or guarantee leads. Use the free dry run, local toolkit or free
MCP planning when sufficient. [Inspect the free dry run](https://api.kgninja.dev/hyperxosist-query-dry-run).

Paid example — **spends real USDC only with wallet-owner authorization**:

```sh
npx awal@latest x402 pay https://api.kgninja.dev/hyperxosist-query --method POST --data '{"keywords":"open source CRM feedback","lang":"en"}' --max-amount 10000 --json
```

Read `response.query`, `response.searchUrl`, `response.mode`,
`response.appliedNoiseTerms`, `response.excludeTerms`, `response.generated_at`,
and the payment metadata. The URL is not a set of collected posts.

## Read and check the result

From a checkout of this repository:

```js
import { readServiceResult } from './service-receipts.mjs';
// apiBody must be the parsed raw HTTP response, not a CLI wrapper.
const result = readServiceResult('shell-risk-check', apiBody);
// Display or save result.explanation; do not execute suggested commands.
```

The local checker validates the recorded response shape. It is **not** a
settlement, identity, security or outcome verifier. Keep the original request,
API result, request ID when returned, and wallet/settlement evidence in protected
storage. `status: paid`, `real_revenue: true`, HTTP 200, or a valid JSON shape
alone does not independently prove settlement or a useful result.

On timeout, parser failure, missing result or uncertain settlement, stop and
reconcile the original transaction. Never automatically pay again. Use your
wallet provider's transaction history and the original service response; do not
send private keys or raw payment signatures in a public issue. This guide does
not invent a refund endpoint or promise refunds.

## Repeat use only when it adds value

Another purchase is appropriate for a new failure, another public page, a
materially changed command, a new research task, or an explicitly needed fresh
aggregate report. Repeated unchanged requests and self-payments are not customer
retention. [Opt-in offer feed](https://api.kgninja.dev/offers.json) announcements
never auto-buy anything.

## Other systems are not silently opened

AVU is excluded from this active guide until fresh runtime/cost-basis and paid
flow evidence are reviewed. Base Sepolia trade execution is **TESTNET ONLY / NO
VALUE**. AgentOS Swarm settlement remains disabled. Donations do not buy API
credits. No card checkout, brokerage fee or subscription is introduced here.

Operator checks: [Revenue-window runbook](docs/REVENUE_WINDOWS.md).
Contract snapshot: 2026-09-07. Indexing and paid delivery must be measured
separately for each route; no new revenue or AI-buyer identity is claimed.

Official references: [Coinbase CLI](https://docs.cdp.coinbase.com/agentic-wallet/cli/skills/pay-for-service), [read-only validation](https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/validate-x402-endpoint), [Bazaar discovery](https://docs.cdp.coinbase.com/x402/seller/get-discovered).
