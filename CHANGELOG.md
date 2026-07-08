# Changelog

All notable changes to this project are documented in this file.

## [2.1.0] — 2026-07-09

### Agent sticky layer
- `planFromIntent` — natural language → multi-angle mission plan
- `buildMission` / `listMissions` / `composeCampaign` — reusable campaigns
- `scoreQuery` — 0–100 quality gate before x402 spend
- `suggestRefinements` — self-heal sparse/noisy results
- `buildHandoffPackage` — Signal-to-Fix keep-only handoff JSON
- `buildRunReceipt` — audit / cron reuse with `encodeState`
- `getToolDefinitions` / `startAgentSession` / `getAgentPlaybook`

### Discovery for AI runtimes
- `llms.txt`, `AGENTS.md`, `agent-tools.json`, `missions.json`
- OpenAI-compatible tool schemas for drop-in tool-calling

### Reliability
- Priority-capped noise excludes (low 14 / medium 26 / high 36)
- `noise.maxTerms` override so X queries stay within length budgets
- Expanded zero-dependency test suite (32 cases)

## [2.0.0] — 2026-07-09

### Advanced search
- Operators: `to:`, `@mention`, `min_retweets`, `min_replies`, OR groups, hashtags, `url:`, media/reply/verified filters, raw operators
- Research templates (product feedback, competitor, news, AI, JP trend, media, clean, signal-to-fix)
- Date presets (24h / 7d / 30d / 90d / 1y)
- UI consumes `agent-api.js` as single source of truth
- Shareable form state via URL hash `#s=`
- `validateInput` / `analyzeQuery` / `explainQuery` / `buildBatch`

## [1.0.0] — prior

- Static X search launcher UI
- Noise reduction presets
- Local history (localStorage)
- Agent-use + x402 payment manifests
- Signal-to-Fix linkage
