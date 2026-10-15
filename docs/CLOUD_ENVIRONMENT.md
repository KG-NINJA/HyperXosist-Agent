# Codex cloud development

Use the existing checkout in the isolated cloud task. Do not create a Git
worktree unless the user explicitly requests one. Read `AGENTS.md` before work.

## Install

From the repository root, run:

```bash
bash scripts/cloud-setup.sh
```

This cloud recipe requires Node.js 24+ and npm. It installs both locked dependency
trees with `npm ci`, then builds the staging Worker with `--dry-run`. The root
library still supports Node.js 18+; the Worker requires Node.js 22+. Python 3 is
needed for the static server and Python tests. No credentials are needed for
local development or the Worker dry run.

The script preserves the supplied proxy and TLS settings. Dependency caches,
Wrangler configuration, and the optional browser adapter use ignored paths.
Repeated installation refreshes dependencies without changing lockfiles.

## Network settings

Keep the environment's package-manager network preset. Add `api.kgninja.dev`
to its custom allowed domains for the read-only OpenAPI check in `npm test`.
GitHub API operations such as PR creation also require `api.github.com` and
appropriate platform authentication; successful Git reads alone do not prove
API or push permission.

For Node.js requests through the managed proxy, initialize each shell:

```bash
export NODE_USE_ENV_PROXY=1
export NO_PROXY="${NO_PROXY:+$NO_PROXY,}localhost,127.0.0.1"
export WRANGLER_SEND_METRICS=false
export XDG_CONFIG_HOME="$PWD/.cache/cloud-config"
```

A proxy 403 requires a network-policy change in Codex environment settings.
Saving a configuration draft does not apply it to the running machine. Review
and save settings, publish through Codex, then retry the affected check. Committing
this guide to GitHub does not change Codex's network policy or publish a snapshot.
Do not disable TLS verification or replace the platform's authentication.

## Start and verify

Start the local HTTP MCP adapter in a managed terminal:

```bash
HOST=127.0.0.1 PORT=8787 npm run mcp:remote
```

`GET http://127.0.0.1:8787/health` must return `ok: true` and service
`hyperxosist-remote-mcp`. Verify `initialize` and `hyperxosist_search_plan` using
the MCP SDK. `npm run test:mcp:remote` performs planning, filtering, and handoff
checks against its own temporary server. Tokenless development must stay bound
to loopback. For stdio clients, use `node mcp/server.js`.

For the optional static UI, use another terminal:

```bash
python3 -m http.server 5173 --bind 127.0.0.1
```

Check HTTP 200 and nonempty content for `/index.html`, `/app.js`, and
`/agent-api.js`. The static site has no build step. Use loopback requests for
validation; the onboarding UI does not support loopback preview links.

Processes must restart in each new task; a saved filesystem does not preserve
running servers. Configure Codex's install script to run
`cd /workspace/HyperXosist-Agent && bash scripts/cloud-setup.sh` for the default
checkout path, and save the initialization, startup, and readiness instructions
above in its startup instructions. Adjust the directory if the checkout moves.

## Checks

After shell initialization, from the repository root:

```bash
npm test
npm --prefix workers/remote-mcp run check -- --env staging
npm --prefix workers/remote-mcp run check -- --env production
python3 -B -m unittest discover -s test -p test_avu_cost_basis.py
npm run test:tool-selection
npm run openai:remote-check
npm run quickstart
npm run agent-handoff-dryrun -- HyperXosist-Agent
npm run avu:demo
npm run marketplace:demo
```

`npm test` stops on a failed check. If the OpenAPI request is blocked, report
that failure distinctly and run later local suites separately; do not report
the aggregate command as passed. After network settings take effect, rerun
`npm run test:payment-endpoints` and then `npm test`.

If the image provides Playwright and `/usr/bin/chromium`, setup creates an
adapter for the existing browser test:

```bash
PLAYWRIGHT_PACKAGE="$PWD/.cache/cloud-setup/playwright-system.cjs" \
  node test/buyer-preflight.browser.mjs
```

The test starts its own server and checks desktop/mobile layout, clipboard,
download, input validation, and payment-preparation boundaries. Results are
written under `${RUNNER_TEMP:-/tmp}/buyer-preflight-qa`. Without the image's
browser prerequisites, follow the isolated Playwright installation in the
`purchase-browser` CI job; browser downloads need their destination domains
allowed. Do not substitute a passing HTTP check for browser QA.

Onboarding validated the local suites, both Worker dry runs, Python tests,
offline demos, local MCP requests, static HTTP responses, and browser QA on
Node.js 24.19.0. The external OpenAPI check was blocked by proxy HTTP 403.
The Docker build and Node.js 18/20 CI matrix were not run locally. Recheck these
outcomes when the repository or environment changes.

Setup does not deploy a Worker, call a live model API, collect external posts,
or authorize payments. Finish with `git status --short` and `git diff --check`.
