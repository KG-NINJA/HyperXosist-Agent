# Contributing

Thanks for helping improve HyperXosist Agent.

## Principles

1. **Single source of truth** — query logic lives in `agent-api.js`. UI (`app.js`) must call it, not reimplement operators.
2. **Agent-first contracts** — keep `agent-use.json`, `agent-tools.json`, `missions.json`, `llms.txt`, and `AGENTS.md` in sync with API changes.
3. **No X API keys** — this stays a static launcher + paid agent path via existing x402 Worker.
4. **Noise must stay length-safe** — auto excludes are priority-capped (`NOISE_TERM_LIMITS`).

## Dev loop

```bash
git clone https://github.com/KG-NINJA/HyperXosist-Agent.git
cd HyperXosist-Agent
npm test
npm run quickstart
npm run serve   # optional local UI on :5173
```

## Pull requests

- Add/extend tests in `test/agent-api.test.js` for API behavior changes.
- Update `CHANGELOG.md` under a new section when user-facing.
- Bump `package.json` version + `agent-api.js` `VERSION` together for releases.
- Do not commit secrets, `node_modules`, or local agent state.

## Code style

- ES5-friendly browser bundle style in `agent-api.js` / `app.js` (no build step).
- Prefer clear function names over heavy frameworks.
- Keep Japanese + English copy understandable in UI labels where space allows.
