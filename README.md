# HyperXosist Agent

[![CI](https://github.com/KG-NINJA/HyperXosist-Agent/actions/workflows/ci.yml/badge.svg)](https://github.com/KG-NINJA/HyperXosist-Agent/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-2.6.0-brightgreen.svg)](CHANGELOG.md)
[![Live](https://img.shields.io/badge/demo-GitHub%20Pages-black.svg)](https://kg-ninja.github.io/HyperXosist-Agent/)

**Agent-first toolkit and Remote MCP server for noise-reduced X (Twitter) search planning and Feedback-to-Fix engineering handoffs.** It generates structured search plans and official X search URLs for humans and AI agents. The planning and synthetic demonstration workflow does **not** directly scrape X. Optional **Grok Build** mode is default off.

| | |
|---|---|
| **Live demo** | https://kg-ninja.github.io/HyperXosist-Agent/ |
| **Repository** | https://github.com/KG-NINJA/HyperXosist-Agent |
| **Agent entry** | https://kg-ninja.github.io/HyperXosist-Agent/llms.txt |
| **CLI** | `npx hyperxosist plan "…" --json` |
| **Version** | 2.6.0 |

> 日本語の要点: X 公式検索用クエリを組み立てる静的ツールです。人間UIとAgentのplanning / filtering / handoffは無料。production executionのみx402支払い対象です。検索結果の埋め込みや自動投稿はしません。

## Agent-readable summary

HyperXosist-Agent helps an AI agent turn a research intent into a structured search plan, an official X search URL, supplied-feedback filtering results, and a Signal-to-Fix engineering handoff. It is a planning and handoff layer: it does not claim to scrape X directly, publish posts, or deploy code automatically.

Free capabilities include MCP discovery, planning, filtering, structured handoff, and local dry-run workflows. Automated production use of generated search URLs and external collection use the existing x402 endpoint and return HTTP 402 until valid payment proof is supplied. Payment requirements are published at [`payment-options.json`](https://api.kgninja.dev/payment-options.json).

Agents must follow the applicable user or operator payment policy. They must not request private keys, seed phrases, wallet secrets, or sensitive user data. If a wallet requires human approval, the agent should ask the operator to review and approve the transaction, then retry the same request with valid x402 payment proof.

---

## Why this exists

Raw X advanced search is powerful but easy to get wrong (spam, engagement bait, overlong excludes, one-angle keyword guesses). HyperXosist gives you:

1. **Humans** — a fast dark UI to compose operators, templates, noise filters, and open official search tabs.
2. **AI agents** — a sticky loop: plan → score → pay → collect → refine → Keep-filter → Grok Build / Signal-to-Fix → receipt.

```
Discover → Plan → Score gate → Pay (x402) → Collect → Self-heal → Keep-filter → Grok Build / Handoff → Remember
```

---

## Features

### For everyone
- **No X API / OAuth** — opens `x.com/search` with a built query
- **Zero build** — static HTML/CSS/JS; works on GitHub Pages
- **Privacy-friendly human path** — form history in `localStorage` only
- **Noise Reduction** — Low / Medium / High with **priority-capped** excludes (safe query length)
- **Advanced operators** — `from` / `to` / `@` / OR groups / hashtags / `url:` / engagement floors / media & reply filters / raw fragment
- **Research templates** & date presets (24h → 1y)
- **Shareable state** — URL hash `#s=...`

### For AI agents
- **Official Model Context Protocol (MCP) Server** — expose query planning, signal filtering, and downstream handoff capabilities to Cursor, Claude Code, and other LLM assistants. Read [docs/MCP.md](docs/MCP.md).
- **`dispatchToolCall` / `runTool`** — real multi-runtime tool dispatch (no hand-written mapping)
- **`toOpenAITools()` / `toAnthropicTools()`** — drop-in schemas for GPT / Claude / Grok / Llama
- **CLI** `bin/hyperxosist.js` — shell agents get `--json` plan / dispatch / keep / handoff
- `exportKeepOnlyJson` — keep-only machine export for any coding agent
- `planFromIntent` / multi-angle **missions**
- `scoreQuery` before spending **$0.01** per paid call
- `suggestRefinements` when results are empty or noisy
- `buildSignalToFixPipeline` → full linked loop into [Signal-to-Fix](https://kg-ninja.github.io/Signal-to-Fix/) (humans: free UI steps; agents: x402)
- `buildHandoffPackage` → Signal-to-Fix keep-only PR handoff package
- Discovery: [`signal-to-fix-pipeline.json`](https://kg-ninja.github.io/HyperXosist-Agent/signal-to-fix-pipeline.json)
- Dual **JSON + Markdown** outputs on core APIs (any LLM style)
- `buildAgentPrompt` — model-agnostic one-small-change implementation prompt
- Transparent noise catalog: `exportNoiseCatalog` / `noise.extraTerms`
- Optional **Grok Build** mode: `createGrokBuildSession` / `buildGrokBuildPrompt` (default off)
- `agent-tools.json` — OpenAI-compatible tools (portable to Claude/Grok/Llama runtimes)
- `llms.txt` + `AGENTS.md` multi-LLM discovery docs

---

## Quick start (human)

1. Open the [live demo](https://kg-ninja.github.io/HyperXosist-Agent/).
2. Enter keywords (and optional OR group, users, dates, engagement).
3. Optionally enable **Noise Reduction** and pick a research template.
4. Click **最新で検索** (Latest) or **話題で検索** (Top) — or `Ctrl+Enter` / `Ctrl+Shift+Enter`.
5. Copy query, search URL, or a shareable state link.
6. **Signal-to-Fix 手動連携（無料）**: 投稿を Collected signals に貼る → **Handoff 生成** → **Signal-to-Fix 用をコピー** → [Signal-to-Fix](https://kg-ninja.github.io/Signal-to-Fix/) で Analyze → **keep のみ**使う。

Local UI:

```bash
git clone https://github.com/KG-NINJA/HyperXosist-Agent.git
cd HyperXosist-Agent
npm run serve
# → http://localhost:5173
```

---

## Quick start (AI agent)

**Discovery order**

1. [llms.txt](https://kg-ninja.github.io/HyperXosist-Agent/llms.txt)
2. [AGENTS.md](https://kg-ninja.github.io/HyperXosist-Agent/AGENTS.md)
3. [agent-use.json](https://kg-ninja.github.io/HyperXosist-Agent/agent-use.json)
4. [agent-tools.json](https://kg-ninja.github.io/HyperXosist-Agent/agent-tools.json)
5. [x402-payment.json](https://kg-ninja.github.io/HyperXosist-Agent/x402-payment.json)

**Any runtime in 3 lines**

```js
const HyperXosistAgent = require('hyperxosist-agent'); // or ./agent-api.js

// 1) Register tools with your model runtime
const tools = HyperXosistAgent.toOpenAITools();     // or toAnthropicTools()

// 2) When the model calls a tool — one dispatcher for all shapes
const { ok, result } = HyperXosistAgent.dispatchToolCall(name, args);
```

**Shell / CLI (no embed)**

```bash
npm run cli -- plan "Find product feedback about Acme for PR specs" --json
# or: node bin/hyperxosist.js dispatch hyperxosist_plan_from_intent \
#        --args '{"intent":"Find feedback about Acme"}' --json
```

**One call (library sticky loop)**

```js
// Node
const HyperXosistAgent = require('./agent-api.js');

const session = HyperXosistAgent.startAgentSession({
  intent: 'Find product feedback about Acme for PR specs'
});

const step = session.plan.primaryStep;
if (step.score.recommendPay) {
  const paid = step.paidRequest;
  // POST paid.body → paid.endpoint
  // expect HTTP 402 until x402 payment proof, then 200
  // after authorization, open step.searchUrl and collect post texts
}

const keepOnly = HyperXosistAgent.exportKeepOnlyJson(
  ['...candidate posts...'],
  { productName: 'Acme' }
);
// → keepOnly.texts / keepOnly.signalToFixInput / keepOnly.agentPrompt

const handoff = HyperXosistAgent.buildHandoffPackage({
  productName: 'Acme',
  feedback: ['...candidate posts...']
});
// → handoff.signalToFix.input into Signal-to-Fix (keep-only only)
// → handoff.grokBuild.prompt for Grok Build

// Grok Build path
const grok = HyperXosistAgent.createGrokBuildSession(
  'Grok Build code improvement for Acme',
  { product: 'Acme', targetArea: 'auth' }
);
const prompt = HyperXosistAgent.buildGrokBuildPrompt({
  productName: 'Acme',
  targetArea: 'auth',
  feedback: ['login button does nothing on Safari']
});
// → paste prompt.markdown into Grok Build
```

**CLI dry-run (no payment, no network required for planning)**

```bash
npm test
npm run quickstart
# or: node examples/quickstart.mjs "Weekly monitor about MyProduct"
```

### ChatGPT Site Tools / WebMCP

The GitHub Pages site feature-detects `document.modelContext.registerTool(...)` and exposes four Site Tools in compatible browser environments.

Free, local, and read-only:

- `hyperxosist_search_plan`
- `hyperxosist_filter_signals`
- `hyperxosist_build_handoff`

Paid production boundary:

- `hyperxosist_execute` — x402 v2 production execution through `https://api.kgninja.dev/hyperxosist-query`

The first call omits `paymentSignature` and returns the server's `PAYMENT-REQUIRED` requirements. A compatible wallet or facilitator authorizes the payment; the caller then retries with the opaque `PAYMENT-SIGNATURE` value and `confirmPayment: true`. The site does not create, request, store, log, or echo private keys, seed phrases, or wallet passwords.

The paid tool is marked consequential and non-idempotent. Clients must not auto-retry a confirmed payment call. Browsers without WebMCP support continue to use the normal human UI unchanged.

### MCP: Local and Remote

The shared MCP core contains the same economic boundary as WebMCP:

- Three free tools: planning, supplied-signal filtering, and engineering handoff.
- One paid tool: `hyperxosist_execute`, which forwards an explicitly confirmed x402 request to the existing payment Worker.

```bash
# Local stdio for Cursor, Claude Code, and compatible clients
npm run mcp

# Optional private Node Streamable HTTP server
HYPERXOSIST_MCP_TOKEN="replace-me" npm run mcp:remote
```

Public production Remote MCP:

- Endpoint: `https://mcp.kgninja.dev/mcp`
- Health: `https://mcp.kgninja.dev/health`
- Transport: Streamable HTTP
- Public free-mode authentication: none
- Private/self-hosted authentication: optional Bearer token
- Currently deployed tools: `hyperxosist_search_plan`, `hyperxosist_filter_signals`, `hyperxosist_build_handoff`
- `hyperxosist_execute`: implemented and tested in the repository, but requires an explicit production Cloudflare Worker deployment before the public Remote MCP advertises it

Merging this repository does not deploy the Cloudflare Worker. Until that manual deployment occurs, the live Remote MCP remains the three-tool free service. The WebMCP paid tool is independent of that deployment and calls the already-live x402 endpoint directly.

The existing x402 route is the only verifier and settlement boundary. MCP and GitHub Pages never create or verify payment proofs. Remote MCP telemetry must not log request content or `PAYMENT-SIGNATURE`; settlement analytics remain authoritative in the x402 Worker.

```bash
npm run openai:remote-check
npm run test:tool-selection
npm run test:paid-execution
npm run test:webmcp
```

See [MCP setup and security](docs/MCP.md), [Remote MCP Worker deployment](workers/remote-mcp/README.md), and [ChatGPT App preparation](docs/CHATGPT_APP.md).

### Agent handoff dry-run (offline — recommended first step)

Demonstrates the full **local** path from search intent → keep filter → Signal-to-Fix handoff → coding-agent prompt **without network access**:

```bash
npm run agent-handoff-dryrun -- HyperXosist-Agent
# or: node examples/agent-handoff-dryrun.mjs "HyperXosist-Agent"
```

What it does (all offline):

1. Builds an agent session / mission from intent  
2. Prints mission ID, subject, primary query, and search URL  
3. Uses **built-in sample feedback** (not live X data)  
4. Runs `filterKeepSignals` (keep vs discard)  
5. Builds `buildHandoffPackage`  
6. Prints Signal-to-Fix input JSON preview  
7. Prints the coding-agent implementation prompt (Markdown)  

**Important:** this is a **local dry-run**. It does **not** scrape X, collect real posts, open the search URL, post anything, or perform x402 payment. Real agent production search still requires x402 after `scoreQuery`.

### Payment policy (agents)

| Use | Cost |
|-----|------|
| Human browser UI and manual official X URL use | Free |
| Local planning, scoring, filtering, and handoff | Free |
| WebMCP free tools | Free |
| Remote MCP deployed planning/filtering/handoff tools | Free |
| `hyperxosist_execute` production execution | **x402 paid**; current metadata states 0.01 USDC on Base |

Execution flow:

1. Call `hyperxosist_execute` with `input` and no payment signature.
2. Receive HTTP 402 requirements, including the standard `PAYMENT-REQUIRED` response header.
3. Authorize through a compatible x402 wallet or facilitator.
4. Retry with `paymentSignature` and `confirmPayment: true`.
5. Read the result and optional `PAYMENT-RESPONSE`; do not automatically repeat the confirmed call.

`payment-options.json` is authoritative for current price, asset, network, payee, and facilitator data. GitHub Pages and MCP do not verify or settle payment.

---



## Missions agents re-run

| ID | Purpose |
|----|---------|
| `product_feedback_radar` | Complaints / feature asks / bugs |
| `signal_to_fix_pipeline` | Harvest → PR handoff loop |
| `competitive_intel` | Mentions + switching language |
| `weekly_monitor` | 7-day cron-friendly window |
| `launch_pulse` | Launch / incident discourse |
| `osint_entity` | from / mention / reply-to angles |
| `grok_code_improvement_radar` | Grok Build: bugs / small asks / DX |
| `ui_ux_feedback_harvest` | Frontend / UI friction for Grok |
| `performance_complaint_detector` | Latency / jank for Grok |

Full catalog: [missions.json](https://kg-ninja.github.io/HyperXosist-Agent/missions.json)

---

## API surface (v2.6)

| Method | Role |
|--------|------|
| **`dispatchToolCall` / `runTool`** | **Execute any tool name** (OpenAI/Anthropic/plain shapes) |
| **`toOpenAITools` / `toAnthropicTools`** | Drop-in tool schemas |
| **`exportKeepOnlyJson`** | Keep-only JSON + S2F input + agent prompt |
| `startAgentSession(opts?)` | Universal session (optional `mode:'grok'`) |
| `planFromIntent(intent)` | NL → mission + scored paid steps + `.markdown` |
| `buildMission(id, ctx)` | Named multi-angle campaign |
| `scoreQuery(input)` | 0–100 + `recommendPay` + `.markdown` |
| `suggestRefinements(input, signals)` | Self-heal + `.markdown` |
| `buildHandoffPackage` | Signal-to-Fix + `agentPrompt` (any LLM) |
| `buildAgentPrompt(opts)` | Universal one-small-change prompt |
| `exportNoiseCatalog` / `customizeNoiseRules` | Transparent noise editing |
| `filterKeepSignals` / `scoreTechnicalDepth` | Keep-only signal quality |
| `buildGrokBuildPrompt` / `createGrokBuildSession` | **Optional** Grok mode |
| `buildQuery` / `buildSearchUrl` / `buildShareUrl` | Query + shareable state |
| `buildPaidRequest` / `buildBatch` | x402 payloads |
| `getToolDefinitions` / `listMissions` | Catalogs (Grok tools opt-in; `format:'anthropic'`) |

### CLI surface

```bash
npx hyperxosist plan "…" --json
npx hyperxosist dispatch <toolName> --args '{…}' --json
npx hyperxosist tools --format openai|anthropic|full --json
npx hyperxosist keep --product X --feedback '[…]' --export-keep-only --json
npx hyperxosist handoff --product X --feedback '[…]' --json
npx hyperxosist pipeline --product X --json
```

---

## Repository layout

```
index.html, app.js, style.css, favicon.svg   # Human UI
agent-api.js                                # Single-source API (Node + browser)
bin/hyperxosist.js                          # Universal CLI (plan/dispatch/tools/keep…)
agent-use.json                              # Agent manifest (sticky loop)
agent-tools.json                            # OpenAI-compatible tools
missions.json                               # Mission catalog
llms.txt, AGENTS.md                         # Agent discovery / playbook
x402-payment.json                           # Payment metadata
top30_repost_blacklist.json                 # Bait phrase reference
examples/quickstart.mjs                     # CLI demo
examples/agent-handoff-dryrun.mjs           # Offline handoff dry-run (intent→keep→S2F)
examples/agent-session.example.json         # Session shape
paid-execution.js                         # Shared x402 402→signature→200 bridge
webmcp.js                                 # Browser Site Tools adapter
access-policy.json                        # Machine-readable free/paid boundary
mcp/tools.js, mcp/core.js                  # Shared MCP schemas + dispatch
mcp/server.js, mcp/remote-server.js         # Local stdio + Remote Streamable HTTP
examples/openai-remote-mcp.mjs              # Responses API Remote MCP example
test/agent-api.test.js                      # Agent API tests
test/mcp-*.test.js                          # stdio, remote, security, schema tests
.github/workflows/ci.yml                    # CI
LICENSE, CHANGELOG.md, SECURITY.md, CONTRIBUTING.md
```

---

## Deploy (GitHub Pages)

1. Push to `main`.
2. **Settings → Pages → Deploy from a branch → `main` / `/ (root)`**.
3. Site: `https://<user>.github.io/HyperXosist-Agent/`

No build step. CI runs tests on every push/PR to `main`.

### Public integration checks

- [ ] UI loads on GitHub Pages  
- [ ] `agent-use.json` / `x402-payment.json` / `access-policy.json` / `llms.txt` fetchable
- [ ] Link to Signal-to-Fix `agent-use.json` works  
- [ ] Unpaid `POST` to hyperxosist-query endpoint returns **402**

---

## Disclaimer

- Not affiliated with X Corp.
- This tool **only builds search queries / opens official search**. It does not embed timelines, auto-post, or replace the X API.
- You are responsible for complying with X’s terms and applicable law when searching or collecting content.

---

## License

[MIT](LICENSE) © 2026 KG-NINJA

## Related

- [Signal-to-Fix](https://kg-ninja.github.io/Signal-to-Fix/) — keep-only PR specs from feedback  
- [CHANGELOG](CHANGELOG.md) · [CONTRIBUTING](CONTRIBUTING.md) · [SECURITY](SECURITY.md)

## MCP discovery and catalog

Machine-readable catalog metadata: https://kg-ninja.github.io/HyperXosist-Agent/mcp-catalog.json

## For AI operators and agent builders

Use HyperXosist-Agent when you need to discover customer complaints, product feedback, or pain points on X/Twitter without starting with noisy ad-hoc queries.

**Common use cases:**

- X/Twitter product-feedback discovery
- Customer complaint and pain-point detection
- Noise-reduced social listening query planning
- Signal filtering for actionable feedback
- AI-agent handoff generation for engineering teams

**30-second Remote MCP quick start:**

1. Connect an MCP client to https://mcp.kgninja.dev/mcp using Streamable HTTP.
2. Call initialize, then tools/list.
3. Start with hyperxosist_search_plan using a natural-language intent.
4. Use hyperxosist_filter_signals and hyperxosist_build_handoff on collected text.
5. For production execution, use `hyperxosist_execute`: inspect the unsigned 402 requirements, authorize with a compatible x402 wallet/facilitator, then retry once with explicit confirmation.

Free MCP planning and handoff tools do not perform external collection. Human browser use remains free; automated production search execution is the paid boundary.
