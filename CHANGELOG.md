## Unreleased

- Connect agent service matching to the existing free API match endpoint and AVU readiness. Add a local matching MCP server, bounded buyer demand contracts, known-self-purchase exclusions, public Bazaar discovery opt-in, CLI and tests. Matching neither authorizes spending nor claims revenue.

- Add an optional AVU artifact-receipt buyer adapter with free local checks, live availability gates, bound x402 authorization, signed-delivery verification and local stage events. Add handoff discovery, offline demo and GET-only status command. No service activation, wallet setup or package release.

- Add OpenAI Responses function-tool export and CLI format for GPT-6 integration; preserve Chat Completions, optional arguments, tool dispatch and payment behavior.

# Changelog

## [2.6.0] - 2026-09-03

### Added
- `hyperxosist_execute` as the single x402-paid production tool for WebMCP, local MCP, and the Remote MCP Worker code path.
- `paid-execution.js`, a shared 402 → PAYMENT-SIGNATURE → 200 bridge with explicit payment confirmation.
- `access-policy.json` and machine-readable free/paid tool metadata.
- Paid execution, WebMCP boundary, and cross-manifest consistency tests.
- Live unsigned endpoint probe confirming CORS preflight, 402, and standard x402 header exposure without making a payment.

### Changed
- Public Remote MCP authentication metadata now reports `none`; Bearer remains optional for private/self-hosted mode.
- Agent use is free for discovery, planning, filtering, and handoff. Payment is required only for production execution.
- Version bumped to 2.6.0.
- Production Remote MCP deployment remains an explicit manual operation; static metadata marks the paid tool as pending until deployed.


All notable changes to this project are documented in this file.

## [Unreleased]

- No unreleased changes.

## [2.5.0] - 2026-07-10

### Remote MCP and OpenAI integration
- Added a stateless Streamable HTTP MCP endpoint at `POST /mcp` with `GET /health`.
- Split shared MCP tool schemas and dispatch into `mcp/tools.js` and `mcp/core.js`; local stdio remains supported.
- Added structured tool output, Bearer authentication, Origin/Host controls, body limits, timeouts, and generic errors.
- Added Responses API configuration example, 20-case tool-selection evaluation, Docker packaging, and ChatGPT App preparation.
- Added Remote, security, schema, and stdio/Remote consistency tests plus Node 18/20 CI coverage.
- Preserved free planning/manual search and the existing x402 automated-production execution boundary.

## [2.4.0] — 2026-07-10

### Practical multi-agent runtime layer
- **`dispatchToolCall(nameOrCall, args?)`** / **`runTool`** — real tool-name → method dispatch for any runtime
  - Accepts plain `(name, args)`, OpenAI `{ function: { name, arguments } }`, Anthropic `{ name, input }`
  - Returns `{ ok, tool, result }` — never throws on unknown tools
- **`toOpenAITools()`** / **`toAnthropicTools()`** — drop-in schema adapters
- **`getToolDefinitions({ format: 'anthropic' })`** — Anthropic Messages tools shape
- **`exportKeepOnlyJson(feedback, options?)`** — keep-only machine export + optional Signal-to-Fix input + agentPrompt
- New tools: `hyperxosist_export_keep_only`, `hyperxosist_start_session`

### Universal CLI
- New `bin/hyperxosist.js` (`npx hyperxosist` / `npm run cli`)
- Commands: `plan`, `session`, `mission`, `missions`, `score`, `query`, `keep`, `export-keep`, `handoff`, `pipeline`, `prompt`, `tools`, `dispatch`, `playbook`, `version`
- `--json` machine stdout for shell agents that cannot embed JS

### Discovery / packaging
- `package.json` version 2.4.0 + `bin.hyperxosist`
- `agent-tools.json`, `agent-use.json`, `llms.txt`, `AGENTS.md` updated for dispatch + CLI
- Expanded zero-dep tests (dispatch shapes, Anthropic tools, CLI smoke)

## [2.3.2] — 2026-07-09

### Agent dry-run handoff (offline CLI)
- New `examples/agent-handoff-dryrun.mjs` — local intent → sample feedback → keep filter → Signal-to-Fix handoff → coding prompt
- `npm run agent-handoff-dryrun -- <ProductName>`
- No network, no X scrape, no payment; built-in sample feedback only
- README / AGENTS.md document the dry-run vs real paid search path
- Test covers dry-run script stdout sections
- Hardening: `agent-api.js` VERSION aligned to 2.3.2; README dry-run fence fixed; CI runs dry-run smoke

## [2.3.1] — 2026-07-09

### Signal-to-Fix linked pipeline
- New `buildSignalToFixPipeline()` — plan + score + paid request + optional handoff in one call
- New `getSignalToFixLinks()` and discovery file `signal-to-fix-pipeline.json`
- UI section **Signal-to-Fix 連携** with explicit **human manual (free)** vs **AI agent auto** steps
- Buttons: Pipeline 計画 / Handoff 生成 / Signal-to-Fix 用をコピー / Signal-to-Fix を開く / Handoff JSON
- `buildHandoffPackage` now points at pipeline manifest + keep-only policy for agents

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
