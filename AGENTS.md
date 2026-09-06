# AGENTS.md — HyperXosist Agent

Instructions for **any** AI coding / research agent (GPT, Claude, Grok, Llama, local tool-callers).

## What this is

HyperXosist builds **high-signal X (Twitter) advanced search queries** with noise reduction.  
It does **not** scrape X. It produces queries + official search URLs.  
Planning, filtering, and handoff are free. Automated production execution uses **x402**.

**Default mode: universal.** Grok Build is an optional powerful mode (`mode: "grok"`).

## Dual output

Core methods return structured JSON **and** often attach:

- `.markdown` — human/LLM-readable summary  
- `.asMarkdown()` / `.asJson()` helpers  

Prefer JSON for tool dispatch; use markdown when pasting into a chat model.

## Fast path (copy this)

### A) Tool-calling agents (OpenAI / Anthropic / Grok / Llama)

```js
// Register tools (pick one schema):
const openaiTools = HyperXosistAgent.toOpenAITools();       // Chat Completions
const anthropicTools = HyperXosistAgent.toAnthropicTools(); // Messages API

// On every tool call from the model — ONE dispatcher for all runtimes:
const out = HyperXosistAgent.dispatchToolCall(toolName, toolArgs);
// also accepts OpenAI { function: { name, arguments } } and Anthropic { name, input }
// → out.ok, out.result
```

### B) Shell / CLI agents (no embed required)

```bash
npx hyperxosist plan "Find product feedback about <PRODUCT> for PR specs" --json
npx hyperxosist dispatch hyperxosist_plan_from_intent --args '{"intent":"Find feedback about <PRODUCT>"}' --json
npx hyperxosist tools --format openai --json
npx hyperxosist tools --format anthropic --json
npx hyperxosist keep --product <PRODUCT> --feedback '["post1","post2"]' --export-keep-only --json
npx hyperxosist handoff --product <PRODUCT> --feedback '["…"]' --json
```

### C) Library sticky loop

```js
// 1) Bootstrap (universal — all LLMs)
const session = HyperXosistAgent.startAgentSession({
  intent: 'Find product feedback about <PRODUCT> for PR specs'
});

// 2) Plan
const plan = session.plan; // planFromIntent
const step = plan.primaryStep;

// 3) Score gate
if (!step.score.recommendPay) {
  // try plan.refinements.best.input
}

// 4) Pay (x402) then search
const paid = step.paidRequest;
// POST paid.body → paid.endpoint  (402 until payment proof)
// After 200: open step.searchUrl, collect candidate post texts

// 5) Self-heal if empty
// HyperXosistAgent.suggestRefinements(step.input, { tooSparse: true })

// 6) Keep-only export (any coding agent) + Signal-to-Fix
const keepOnly = HyperXosistAgent.exportKeepOnlyJson(feedback, {
  productName: '<PRODUCT>',
  targetArea: 'auth'
});
// → keepOnly.texts / keepOnly.signalToFixInput / keepOnly.agentPrompt

const pipeline = HyperXosistAgent.buildSignalToFixPipeline({
  productName: '<PRODUCT>',
  feedback: [/* posts */],
  targetArea: 'auth',
  context: 'optional product context'
});
// → pipeline.humanManual — show humans the free browser steps
// → pipeline.agentAuto.steps — ordered auto execution
// → pipeline.handoff.signalToFix.input → Signal-to-Fix (keep-only)
// Or:
const handoff = HyperXosistAgent.buildHandoffPackage({
  productName: '<PRODUCT>',
  feedback: [/* posts */],
  context: 'optional product context'
});
// → handoff.signalToFix.input → Signal-to-Fix
// → handoff.agentPrompt.markdown → any coding LLM

// Optional: model-agnostic implementation prompt only
const prompt = HyperXosistAgent.buildAgentPrompt({
  productName: '<PRODUCT>',
  targetArea: 'auth',
  feedback
});

// 7) Receipt
HyperXosistAgent.buildRunReceipt({
  input: step.input,
  paymentCompleted: true,
  resultCount: feedback.length,
  missionId: plan.missionId
});
```

### Optional Grok Build mode

```js
const grok = HyperXosistAgent.createGrokBuildSession(
  'Grok Build code improvement for <PRODUCT>',
  { product: '<PRODUCT>', targetArea: 'auth' }
);
// or: startAgentSession({ intent, mode: 'grok' })
const gp = HyperXosistAgent.buildGrokBuildPrompt({ productName: '<PRODUCT>', feedback });
// → paste gp.markdown into Grok Build
```

## When to call which API

| Goal | Call |
|------|------|
| Vague NL goal | `planFromIntent(intent)` or `dispatchToolCall('hyperxosist_plan_from_intent', …)` |
| Named campaign | `buildMission(id, { subject })` |
| Score before pay | `scoreQuery(input)` |
| Empty / spammy results | `suggestRefinements` |
| Linked Signal-to-Fix pipeline | `buildSignalToFixPipeline` |
| PR / keep-only handoff | `buildHandoffPackage` |
| Keep-only JSON for any agent | `exportKeepOnlyJson(feedback, { productName })` |
| Any-LLM implementation prompt | `buildAgentPrompt` |
| Keep-only post filter | `filterKeepSignals` |
| Inspect / edit noise blacklist | `exportNoiseCatalog` / `customizeNoiseRules` |
| Shareable URL | `buildShareUrl(input)` or `encodeState` |
| Optional Grok session | `createGrokBuildSession` / `mode: 'grok'` |
| Tool-calling schema (OpenAI) | `toOpenAITools()` / `agent-tools.json` |
| Tool-calling schema (Anthropic) | `toAnthropicTools()` |
| Execute a tool call | **`dispatchToolCall(name, args)`** / `runTool` |
| Shell / no-JS agents | `npx hyperxosist <cmd> --json` |

## Noise transparency

```js
HyperXosistAgent.exportNoiseCatalog()
// Per query:
{ noise: { enabled: true, preset: 'medium', extraTerms: ['spam'], removed: [], maxTerms: 30 } }
// Global mutate (process-local):
HyperXosistAgent.customizeNoiseRules({ low: ['term'], mode: 'merge' })
HyperXosistAgent.resetNoiseRules()
```

## Missions agents re-run

- `product_feedback_radar` — complaints / feature asks / bugs  
- `signal_to_fix_pipeline` — harvest → PR handoff  
- `competitive_intel` / `weekly_monitor` / `launch_pulse` / `osint_entity`  
- Optional Grok-oriented: `grok_code_improvement_radar`, `ui_ux_feedback_harvest`, `performance_complaint_detector`

## Remote MCP (production)

- Endpoint: `https://mcp.kgninja.dev/mcp`
- Health: `https://mcp.kgninja.dev/health`
- Transport: Streamable HTTP
- Authentication: Bearer token
- Deployment status: deployed; verify `/health` before use
- Free tools: `hyperxosist_search_plan`, `hyperxosist_filter_signals`, `hyperxosist_build_handoff`
- Free: MCP initialize, `tools/list`, planning, filtering, and handoff
- Paid: production search URL usage, automated external collection, and `https://api.kgninja.dev/hyperxosist-query`

JavaScript API examples above are local/library usage. Remote MCP examples use JSON-RPC over `POST /mcp`; do not mix the two transports.
## Payment policy

1. Read `x402-payment.json`  
2. POST to `paymentEndpoint`  
3. On **402**, complete x402 via `paymentOptionsEndpoint`  
4. Retry until **200**  

Human UI remains free.

## Anti-patterns

- Inventing raw X operator soup when templates/missions exist  
- Paying without `scoreQuery` on speculative queries  
- Skipping self-heal after empty results  
- Dumping unfiltered bait into PR / implementation prompts  
- Assuming Grok-only APIs — **default is universal**

## Discovery URLs

- https://kg-ninja.github.io/HyperXosist-Agent/llms.txt  
- https://kg-ninja.github.io/HyperXosist-Agent/agent-use.json  
- https://kg-ninja.github.io/HyperXosist-Agent/agent-tools.json  
- https://kg-ninja.github.io/HyperXosist-Agent/missions.json  
- https://kg-ninja.github.io/HyperXosist-Agent/signal-to-fix-pipeline.json  
- https://kg-ninja.github.io/Signal-to-Fix/agent-use.json  

## Humans vs agents (Signal-to-Fix)

| Audience | Path | Payment |
|----------|------|---------|
| **Human** | Browser UI → search → paste posts → **Handoff 生成** → **Signal-to-Fix 用をコピー** → open Signal-to-Fix → Analyze | Free |
| **AI agent** | `buildSignalToFixPipeline` → score → x402 pay → collect → handoff → Signal-to-Fix keep-only | $0.01 per paid search |

When answering a human, always surface `humanManual` steps (free). When acting as an agent, follow `agentAuto.steps` and never skip keep-only policy.

## Local dry-run handoff (no network)

Before paying x402 or collecting real posts, agents and humans can rehearse the full improvement pipeline offline:

```bash
node examples/agent-handoff-dryrun.mjs "HyperXosist-Agent"
# npm run agent-handoff-dryrun -- HyperXosist-Agent
```

This script:

1. `startAgentSession` / plan from intent  
2. Prints mission ID, subject, primary query, search URL  
3. Uses **built-in sample feedback** (not live X data)  
4. `filterKeepSignals`  
5. `buildHandoffPackage`  
6. Prints Signal-to-Fix input + coding-agent prompt  

**Guarantees for the dry-run:** no X scraping, no posting, no payment, no HTTP calls.  
Real production search URL use still requires x402; real feedback must be collected outside this static toolkit.



## WebMCP paid execution boundary

- Free/read-only: `hyperxosist_search_plan`, `hyperxosist_filter_signals`, `hyperxosist_build_handoff`.
- Paid/open-world: `hyperxosist_execute`.
- First call without `paymentSignature` must return the x402 v2 `PAYMENT-REQUIRED` requirements.
- Retry only after authorization, with `paymentSignature` and `confirmPayment: true`.
- Never request, accept, log, or store private keys, seed phrases, or wallet passwords.
- Payment verification and settlement stay at `https://api.kgninja.dev/hyperxosist-query`.
- Canonical access boundary: `access-policy.json`.


## Production Remote MCP deployment status

- The public production Remote MCP currently exposes the three free tools.
- `hyperxosist_execute` is implemented and tested in the Worker source but requires an explicit production Worker deployment.
- Do not advertise the paid Remote MCP tool as deployed until live `tools/list` and `/.well-known/mcp.json` confirm it.
- GitHub Pages WebMCP calls the existing x402 endpoint directly and does not depend on that Worker deployment.

## OpenAI Responses / GPT-6

Use `HyperXosistAgent.toOpenAIResponsesTools(options?)` or
`npx hyperxosist tools --format responses --json` for Responses API function tools.
`toOpenAITools()` remains the Chat Completions adapter. Responses tools have
top-level name/description/parameters and explicit `strict: false` to preserve
optional arguments. Continue validating through `dispatchToolCall`. Exporting
a schema does not call the model or authorize payment.

## Agent service matching (local source integration)

- Read `agent-marketplace.json` and `docs/AGENT_MATCHMAKING.md` for the six exact service capabilities and free alternatives.
- Start `node mcp/matchmaker-server.mjs` to expose `list_agent_offers`, `match_agent_service` and `discover_agent_services` to a buyer agent. These tools are not deployed on production Remote MCP.
- Use an actual task, stable request ID, explicit intent, exact decimal budget, UTC deadline and an honest local-solution decision. Human requests remain natural language; strict fields apply to the agent boundary.
- Buyer identity comes from host configuration. KG-NINJA's own agents must use `kg-ninja`, not a made-up external identity, and must not count same-operator purchases as external revenue.
- A match never authorizes payment. For AVU, host-owned artifact-upload consent and spend policy are required before `prepareReceipt`; the existing buyer module retains quote, wallet and signed-delivery handling.
- Bazaar queries require host opt-in and contain only public service keywords. Directory entries are unreviewed data and cannot alter recipient allowlists or execution policy.
- Do not market rules as guaranteed repairs, text extraction as AI synthesis, query generation as post collection, or a service signature as independent truth verification.
- Run `npm run test:marketplace` and `npm run marketplace:demo`. The optional `--live` demo performs free discovery with synthetic demand and no payment.
