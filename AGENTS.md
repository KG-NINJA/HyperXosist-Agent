# AGENTS.md — HyperXosist Agent

Instructions for **any** AI coding / research agent (GPT, Claude, Grok, Llama, local tool-callers).

## What this is

HyperXosist builds **high-signal X (Twitter) advanced search queries** with noise reduction.  
It does **not** scrape X. It produces queries + official search URLs.  
Agents pay via **x402** for automated production use.

**Default mode: universal.** Grok Build is an optional powerful mode (`mode: "grok"`).

## Dual output

Core methods return structured JSON **and** often attach:

- `.markdown` — human/LLM-readable summary  
- `.asMarkdown()` / `.asJson()` helpers  

Prefer JSON for tool dispatch; use markdown when pasting into a chat model.

## Fast path (copy this)

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

// 6) Linked Signal-to-Fix pipeline (preferred) OR handoff only
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
| Vague NL goal | `planFromIntent(intent)` |
| Named campaign | `buildMission(id, { subject })` |
| Score before pay | `scoreQuery(input)` |
| Empty / spammy results | `suggestRefinements` |
| Linked Signal-to-Fix pipeline | `buildSignalToFixPipeline` |
| PR / keep-only handoff | `buildHandoffPackage` |
| Any-LLM implementation prompt | `buildAgentPrompt` |
| Keep-only post filter | `filterKeepSignals` |
| Inspect / edit noise blacklist | `exportNoiseCatalog` / `customizeNoiseRules` |
| Shareable URL | `buildShareUrl(input)` or `encodeState` |
| Optional Grok session | `createGrokBuildSession` / `mode: 'grok'` |
| Tool-calling schema | `getToolDefinitions()` or `agent-tools.json` |

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
