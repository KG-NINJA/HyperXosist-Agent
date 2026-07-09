# Changelog

All notable changes to this project are documented in this file.

## [2.3.0] — 2026-07-09

### Universal agent first
- Default **mode: `universal`** for GPT / Claude / Grok / Llama / local tool-callers
- Dual output: core APIs attach **`.markdown`** + `asMarkdown()` / `asJson()` (JSON remains primary)
- `buildAgentPrompt` — model-agnostic one-small-change implementation prompt
- `getToolDefinitions()` omits Grok-only tools unless `{ includeGrok: true }` or `{ mode: "grok" }`
- `startAgentSession` defaults to universal; optional `mode: "grok"`
- `buildHandoffPackage` always includes `agentPrompt`; `grokBuild` only when Grok mode is on
- Discovery docs rewritten for multi-LLM clarity (`llms.txt`, `AGENTS.md`, `agent-use.json`)

### Noise transparency
- `exportNoiseCatalog` / `customizeNoiseRules` / `importNoiseCatalog` / `resetNoiseRules`
- Per-query `noise.extraTerms` and `noise.customRules` overlays
- UI: extra exclude field + Noise catalog export

### UI
- **Agent Prompt** section for any LLM (always on)
- **Grok Build mode** toggle default **OFF**
- Share state restore from `?s=` query param as well as `#s=`

### Grok Build (optional)
- Unchanged helpers: `createGrokBuildSession`, `buildGrokBuildPrompt`, Grok missions
- Explicitly optional; not required for generic agent workflows

## [2.2.0] — 2026-07-09

### Grok Build layer
- `buildGrokBuildPrompt` — structured Markdown for one small code improvement
- `createGrokBuildSession` — Grok-oriented sticky session (mission + prompt template)
- `scoreTechnicalDepth` / `filterKeepSignals` / `summarizeGrokFocus` — Keep-only for code work
- Missions: `grok_code_improvement_radar`, `ui_ux_feedback_harvest`, `performance_complaint_detector`
- Templates: `grok_code_improvement`, `ui_ux_feedback`, `performance_complaint`
- `buildHandoffPackage` now embeds `grokBuild.prompt` + Keep signals
- UI: **Grok Build Prompt** / **Send to Grok** / session-from-keywords section
- Noise medium/high: empty praise, ragebait, abstract vibes for Grok-friendly harvest
- Tool defs: `hyperxosist_build_grok_prompt`, `hyperxosist_filter_keep_signals`, `hyperxosist_create_grok_session`

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
