# AGENTS.md — HyperXosist Agent

Instructions for AI coding / research agents using HyperXosist.

## What this is

HyperXosist builds **high-signal X (Twitter) advanced search queries** with noise reduction.  
It does **not** scrape X. It produces queries + official search URLs.  
Agents pay via **x402** for automated production use.

## Fast path (copy this)

```js
// 1) Bootstrap
const session = HyperXosistAgent.startAgentSession({
  intent: 'Find product feedback about <PRODUCT> for PR specs'
});

// 2) Prefer multi-angle mission over a single guess
const plan = session.plan; // from planFromIntent
const step = plan.primaryStep;

// 3) Score gate — don't pay for band=poor unless intentional
if (!step.score.recommendPay) {
  // try plan.refinements.best.input
}

// 4) Pay (x402) then search
const paid = step.paidRequest;
// POST paid.body → paid.endpoint  (402 until payment proof)
// After 200: use paid result / step.searchUrl to collect candidate post texts

// 5) Self-heal if empty
// HyperXosistAgent.suggestRefinements(step.input, { tooSparse: true })

// 6) Handoff to Signal-to-Fix
const handoff = HyperXosistAgent.buildHandoffPackage({
  productName: '<PRODUCT>',
  feedback: [/* candidate post texts */],
  context: 'optional product context for Grok'
});
// → handoff.signalToFix.input into https://kg-ninja.github.io/Signal-to-Fix/
// → handoff.grokBuild.prompt for Grok Build (Keep-filtered)

// 6b) Grok Build path (X voice → one small code change)
const grok = HyperXosistAgent.createGrokBuildSession(
  'Grok Build code improvement for <PRODUCT>',
  { product: '<PRODUCT>', targetArea: 'auth', context: '...' }
);
// After collect:
const keep = HyperXosistAgent.filterKeepSignals(feedback);
const prompt = HyperXosistAgent.buildGrokBuildPrompt({
  productName: '<PRODUCT>',
  targetArea: 'auth',
  context: '...',
  feedback
});
// → paste prompt.markdown into Grok Build

// 7) Receipt for memory / cron
HyperXosistAgent.buildRunReceipt({
  input: step.input,
  paymentCompleted: true,
  resultCount: feedback.length,
  missionId: plan.missionId
});
```

## When to call which API

| Goal | Call |
|------|------|
| User said something vague in NL | `planFromIntent(intent)` |
| Named campaign (feedback, competitor, weekly…) | `buildMission(id, { subject })` |
| Multi-locale multi-goal | `composeCampaign({ product, goals, locales })` |
| Single structured query | `buildQuery` / `buildSearchUrl` |
| Before spending $0.01 | `scoreQuery(input)` |
| 0 results or spammy | `suggestRefinements` |
| Ready for PR specs | `buildHandoffPackage` |
| Grok Build session (missions + prompt template) | `createGrokBuildSession(intent, productContext)` |
| Keep-only for code work | `filterKeepSignals(feedback)` / `scoreTechnicalDepth(text)` |
| Structured Grok Build Markdown | `buildGrokBuildPrompt({ productName, feedback, ... })` |
| Tool-calling runtime | `getToolDefinitions()` or `agent-tools.json` |
| Session memory | `buildRunReceipt` + `encodeState` |

## Missions agents actually re-run

- `product_feedback_radar` — complaints / feature asks / bugs
- `signal_to_fix_pipeline` — harvest → PR handoff loop
- `competitive_intel` — mentions + switching language
- `weekly_monitor` — 7d cron-friendly
- `launch_pulse` — release / incident
- `osint_entity` — from / mention / reply-to angles
- `grok_code_improvement_radar` — Grok Build: bugs + small feature asks + DX
- `ui_ux_feedback_harvest` — Grok Build frontend / UI friction
- `performance_complaint_detector` — Grok Build latency / jank

## Payment policy (non-negotiable for agents)

1. Read `x402-payment.json`
2. POST input to `paymentEndpoint`
3. On **402**, complete x402 using `paymentOptionsEndpoint`
4. Retry until **200**
5. Only then treat search URL / paid query as production-authorized

Human UI at `index.html` remains free.

## Quality bar

- Prefer `noise.enabled=true` preset `medium` or `high`
- Prefer `excludeReplies` for original-post discovery
- Prefer date windows for monitors (`applyDatePreset('7d')`)
- Prefer missions over single keywords for product work
- Downstream Signal-to-Fix: **only `decision === "keep"`** items
- Grok Build: **only high technical-depth Keep signals** (`filterKeepSignals`)
- Grok prompts: **one small improvement only** (explicit file/diff/tests/priority)

## Anti-patterns

- Inventing raw X operator soup when templates/missions exist
- Paying without `scoreQuery` on speculative queries
- Skipping self-heal after empty results
- Dumping unfiltered viral bait into PR pipelines
- Using Signal-to-Fix reduce/discard items in implementation prompts
- Pasting empty praise / ragebait into Grok Build without Keep filter

## Discovery URLs

- https://kg-ninja.github.io/HyperXosist-Agent/llms.txt
- https://kg-ninja.github.io/HyperXosist-Agent/agent-use.json
- https://kg-ninja.github.io/HyperXosist-Agent/agent-tools.json
- https://kg-ninja.github.io/HyperXosist-Agent/missions.json
