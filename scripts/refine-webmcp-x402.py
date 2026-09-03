#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = "2.6.0"
TODAY = "2026-09-03"
FREE_TOOLS = [
    "hyperxosist_search_plan",
    "hyperxosist_filter_signals",
    "hyperxosist_build_handoff",
]
PAID_TOOL = "hyperxosist_execute"


def p(rel: str) -> Path:
    return ROOT / rel


def read_preserved(rel: str) -> tuple[str, str]:
    data = p(rel).read_bytes()
    newline = "\r\n" if data.count(b"\r\n") > max(0, data.count(b"\n") // 2) else "\n"
    text = data.decode("utf-8-sig").replace("\r\n", "\n").replace("\r", "\n")
    return text, newline


def write_preserved(rel: str, text: str, newline: str | None = None) -> None:
    target = p(rel)
    target.parent.mkdir(parents=True, exist_ok=True)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    if newline == "\r\n":
        text = text.replace("\n", "\r\n")
    target.write_bytes(text.encode("utf-8"))


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def replace_section(text: str, start: str, end: str, replacement: str, label: str) -> str:
    start_index = text.find(start)
    if start_index < 0:
        raise RuntimeError(f"{label}: start heading not found")
    end_index = text.find(end, start_index + len(start))
    if end_index < 0:
        raise RuntimeError(f"{label}: end heading not found")
    return text[:start_index] + replacement.rstrip() + "\n\n" + text[end_index:]


def load_json(rel: str) -> tuple[dict, str]:
    text, newline = read_preserved(rel)
    return json.loads(text), newline


def dump_json(rel: str, value: dict, newline: str, compact: bool = False) -> None:
    if compact:
        text = json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n"
    else:
        text = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    write_preserved(rel, text, newline)


README_SITE_TOOLS = """### ChatGPT Site Tools / WebMCP

The GitHub Pages site feature-detects `document.modelContext.registerTool(...)` and exposes four Site Tools in compatible browser environments.

Free, local, and read-only:

- `hyperxosist_search_plan`
- `hyperxosist_filter_signals`
- `hyperxosist_build_handoff`

Paid production boundary:

- `hyperxosist_execute` — x402 v2 production execution through `https://api.kgninja.dev/hyperxosist-query`

The first call omits `paymentSignature` and returns the server's `PAYMENT-REQUIRED` requirements. A compatible wallet or facilitator authorizes the payment; the caller then retries with the opaque `PAYMENT-SIGNATURE` value and `confirmPayment: true`. The site does not create, request, store, log, or echo private keys, seed phrases, or wallet passwords.

The paid tool is marked consequential and non-idempotent. Clients must not auto-retry a confirmed payment call. Browsers without WebMCP support continue to use the normal human UI unchanged.
"""

README_MCP = """### MCP: Local and Remote

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
"""

README_PAYMENT = """### Payment policy (agents)

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
"""

DOC_MCP = """# HyperXosist Model Context Protocol (MCP)

HyperXosist-Agent uses one shared MCP core across local stdio, the Node Streamable HTTP adapter, and the Cloudflare Worker adapter. GitHub Pages remains a static site; its WebMCP adapter is a separate browser integration.

## Tool and payment boundary

Free and read-only:

- `hyperxosist_search_plan`: specialized X research planning and official `x.com/search` URLs.
- `hyperxosist_filter_signals`: filtering of X post text already supplied by the caller.
- `hyperxosist_build_handoff`: Signal-to-Fix input and coding-agent handoff from supplied feedback.

Paid and consequential:

- `hyperxosist_execute`: production execution through the existing x402 v2 endpoint.

The paid tool does not receive wallet private material. An unsigned call returns `PAYMENT-REQUIRED`; a compatible client authorizes payment and retries with an opaque `PAYMENT-SIGNATURE` plus `confirmPayment: true`. Do not automatically retry confirmed payment calls.

## Local stdio

Requirements: Node.js 18 or newer.

```bash
npm install
npm run mcp
```

Example:

```json
{
  "mcpServers": {
    "hyperxosist": {
      "command": "node",
      "args": ["/absolute/path/to/HyperXosist-Agent/mcp/server.js"]
    }
  }
}
```

All four code-defined tools are available locally. Paid execution still settles only through `https://api.kgninja.dev/hyperxosist-query`.

## Node Streamable HTTP adapter

```bash
export HYPERXOSIST_MCP_TOKEN="replace-with-a-long-random-secret"
export HOST=127.0.0.1
export PORT=8787
npm run mcp:remote
```

Endpoints:

- `POST /mcp`
- `GET /health`
- `GET /mcp`: 405 in stateless mode

The Node server may be run locally without a token. Public private-mode deployments should use HTTPS, Bearer authentication, host/origin controls, body limits, timeouts, monitoring, and a shared rate limiter.

## Public Cloudflare Remote MCP

Production endpoint: `https://mcp.kgninja.dev/mcp`  
Health endpoint: `https://mcp.kgninja.dev/health`

The current production configuration uses public free mode for the three read-only tools. Bearer authentication remains available for private/self-hosted mode. The repository now includes `hyperxosist_execute` in the Worker source, but the public endpoint will not expose it until an explicit production Worker deployment is performed.

Merging `main` does not deploy the Worker. Follow the staged deployment procedure in [`workers/remote-mcp/README.md`](../workers/remote-mcp/README.md). Do not claim the paid Remote MCP tool is live before `tools/list` and `/.well-known/mcp.json` on the deployed Worker confirm it.

## x402 execution protocol

Authoritative payment metadata:

- OpenAPI: `https://api.kgninja.dev/openapi.json`
- Payment options: `https://api.kgninja.dev/payment-options.json`
- Paid endpoint: `https://api.kgninja.dev/hyperxosist-query`
- Access policy: `https://kg-ninja.github.io/HyperXosist-Agent/access-policy.json`

Current published metadata states x402 v2, exact scheme, 0.01 USDC, Base (`eip155:8453`). The payment endpoint's live response remains authoritative.

Standard headers:

- Response on 402: `PAYMENT-REQUIRED`
- Confirmed retry request: `PAYMENT-SIGNATURE`
- Successful settlement response: `PAYMENT-RESPONSE`

The browser route has been checked for a 204 CORS preflight, allowance of `PAYMENT-SIGNATURE`, exposure of `PAYMENT-REQUIRED` and `PAYMENT-RESPONSE`, and an unsigned 402 JSON response. No payment was performed by that check.

## Security policy

- Never request or accept private keys, seed phrases, wallet passwords, or arbitrary authorization headers as payment material.
- Treat `PAYMENT-SIGNATURE` as opaque authorization data; do not log or echo it.
- Require `confirmPayment: true` before transmitting a supplied signature.
- Do not auto-retry confirmed payment calls.
- Keep payment endpoint selection on the checked-in allowlist.
- Keep planning, filtering, and handoff free; do not use them as a payment bypass for production execution.
- The x402 Worker remains the only payment verifier and settlement system.
- Keep request bodies, prompts, tokens, payment headers, and wallet data out of MCP telemetry.

## Validation

```bash
npm run test:agent
npm run test:mcp
npm run test:mcp:core
npm run test:mcp:remote
npm run test:mcp:security
npm run test:mcp:schema
npm run test:mcp:consistency
npm run test:mcp:cloudflare
npm run test:paid-execution
npm run test:webmcp
npm run test:access-policy
npm run openai:remote-check
```

Cloudflare dry run, without deployment:

```bash
npm --prefix workers/remote-mcp run check -- --env staging
npm --prefix workers/remote-mcp run check -- --env production
```

## OpenAI and other MCP clients

A public HTTPS Remote MCP URL can be supplied to compatible MCP clients. The paid tool additionally requires an x402-capable wallet or facilitator flow. Do not assume a client can automatically produce `PAYMENT-SIGNATURE`; feature-detect or obtain explicit operator authorization.

See [`CHATGPT_APP.md`](CHATGPT_APP.md). Directory submission and production Worker deployment remain manual operations.
"""

WORKER_README = """# HyperXosist Remote MCP Worker

This Cloudflare Worker is the public Streamable HTTP adapter. It is separate from GitHub Pages and from the existing x402 payment Worker.

## Tools

Free/read-only:

- `hyperxosist_search_plan`
- `hyperxosist_filter_signals`
- `hyperxosist_build_handoff`

Paid/consequential after this Worker version is deployed:

- `hyperxosist_execute`

The paid tool forwards an explicitly confirmed request to `https://api.kgninja.dev/hyperxosist-query`. The x402 Worker, not this MCP Worker, verifies and settles the payment.

## Access modes

`HYPERXOSIST_MCP_PUBLIC_FREE_ACCESS=true` enables the current public production mode. In this mode, MCP discovery and the three free tools require no Bearer token.

Private/self-hosted mode sets public free access to false and uses:

- `HYPERXOSIST_MCP_TOKEN`, or
- `HYPERXOSIST_MCP_TOKEN_USERS`, a SHA-256 token-hash registry with optional user ID, plan, status, and daily limit.

Raw tokens are never logged. `HYPERXOSIST_MCP_ALLOWED_ORIGINS` remains closed by default for browser callers, and `HYPERXOSIST_MCP_ALLOWED_HOSTS` restricts the production hostname.

## Payment safety

- Accept payment proof only as the `paymentSignature` tool argument.
- Require `confirmPayment: true` before forwarding it as `PAYMENT-SIGNATURE`.
- Never request or store private keys, seed phrases, wallet passwords, or arbitrary Authorization headers.
- Never log the signature or request body.
- Do not automatically retry a confirmed payment call.
- Keep `HYPERXOSIST_PAYMENT_ENVIRONMENT=production` for `api.kgninja.dev`; use `staging` only for the checked-in staging endpoint.

## Local verification

Wrangler requires Node.js 22 or newer for this Worker package. The root package remains compatible with Node.js 18 or newer.

```bash
npm ci
npm --prefix workers/remote-mcp ci
npm run test:mcp:cloudflare
npm run test:paid-execution
npm --prefix workers/remote-mcp run check -- --env staging
npm --prefix workers/remote-mcp run check -- --env production
```

## Staged deployment

Production deployment is intentionally manual. Merging the repository does not deploy this Worker.

1. Verify all tests and both Wrangler dry runs.
2. Deploy staging and check `initialize`, `tools/list`, all three free tools, and unsigned `hyperxosist_execute` returning structured payment requirements.
3. Confirm no request content or `PAYMENT-SIGNATURE` appears in logs.
4. Deploy production only after reviewing the custom-domain and rate-limit configuration.
5. Verify live `/.well-known/mcp.json`, `/health`, and `tools/list` before changing static metadata from pending to deployed.

```bash
cd workers/remote-mcp
npx wrangler deploy --env staging
# Explicit operator-approved production step:
npx wrangler deploy --env production
```

Production is configured for `mcp.kgninja.dev`, disables `workers.dev` and preview URLs, and restricts the Host allowlist to that hostname. Keep a zone-level WAF/rate-limit rule for `POST /mcp`.

## Operations and analytics

MCP logs include sanitized request ID, user ID, plan, operation, status, latency, client family, and error code. Request bodies, prompts, tokens, payment signatures, and wallet data must not be logged.

Payment settlement, D1 revenue/access/funnel summaries, and Telegram notifications remain authoritative in the existing x402 Worker. MCP telemetry records the MCP operation; it is not settlement evidence.

Optional bindings:

- `MCP_USAGE_KV`: per-user daily limits
- `MCP_ANALYTICS`: aggregate-safe data points
"""

CHATGPT_APP = """# ChatGPT App preparation

This repository is not submitted to the ChatGPT app directory. Submission and production Remote MCP deployment remain manual.

## Proposed listing

- App name: **HyperXosist - X Research & Feedback Radar**
- Description: Build focused X search plans, filter supplied X posts for actionable product signals, create Signal-to-Fix coding handoffs, and optionally execute the production x402 route with explicit payment authorization. HyperXosist does not scrape X or provide general web search.
- Free tools:
  - `hyperxosist_search_plan`
  - `hyperxosist_filter_signals`
  - `hyperxosist_build_handoff`
- Paid tool:
  - `hyperxosist_execute`

## Paid-tool consent model

An unsigned call returns `PAYMENT-REQUIRED`. The client must have a compatible x402 wallet or facilitator, obtain applicable operator authorization, and retry with an opaque `PAYMENT-SIGNATURE` plus `confirmPayment: true`.

The app must never request private keys, seed phrases, wallet passwords, or arbitrary payment authorization headers. Confirmed payment calls must not be automatically retried.

Do not claim ChatGPT can automatically complete the payment until the target ChatGPT environment has been tested with a compatible x402 authorization flow.

## Required public materials

- Privacy policy covering in-memory processing, no post persistence, retention, subprocessors, and contact.
- Terms covering acceptable use, X terms compliance, x402 charges, refunds/failure handling, and availability.
- Support and incident-response contact.
- Stable HTTPS Remote MCP URL.
- Accurate public-free versus private/self-hosted authentication policy.
- Machine-readable `access-policy.json`, payment metadata, and current deployment status.

## Test prompts

- Find user complaints and feature requests on X about HyperXosist-Agent.
- Filter these collected X posts for actionable bugs.
- Build an engineering handoff from these collected tweets.
- Execute this approved production query and show the x402 requirements before any payment.
- What is the weather in Osaka? (must not select HyperXosist.)

## Submission checklist

- [ ] Production Remote MCP `tools/list` includes only tools actually deployed.
- [ ] `hyperxosist_execute` has been staged, explicitly deployed, and smoke-tested before being marked live for Remote MCP.
- [ ] Public free-mode and private Bearer-mode behavior are documented accurately.
- [ ] Origin, host, payload, timeout, quota, and rate limits are enforced.
- [ ] Privacy policy, terms, support, and incident-response URLs are public.
- [ ] Tool-selection and all x402/WebMCP tests pass.
- [ ] No secrets, request bodies, or payment signatures appear in logs or repository history.
- [ ] Planning, filtering, and handoff remain free.
- [ ] Payment requires explicit confirmation and no auto-retry.
- [ ] ChatGPT developer-mode tests pass against the public endpoint.
- [ ] App submission details are manually reviewed.
"""

CONSISTENCY_TEST = r"""'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { TOOL_DEFINITIONS } = require('../mcp/tools.js');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const load = (file) => JSON.parse(read(file));
const freeTools = [
  'hyperxosist_search_plan',
  'hyperxosist_filter_signals',
  'hyperxosist_build_handoff',
];
const paidTool = 'hyperxosist_execute';

const packageJson = load('package.json');
const agentUse = load('agent-use.json');
const agentTools = load('agent-tools.json');
const discovery = load('.well-known/mcp.json');
const catalog = load('mcp-catalog.json');
const access = load('access-policy.json');
const payment = load('x402-payment.json');

for (const manifest of [agentUse, agentTools, discovery, access]) {
  assert.equal(manifest.version, packageJson.version);
}
assert.equal(packageJson.version, '2.6.0');
assert.equal(agentUse.requiresPaymentForAgentUse, false);
assert.equal(agentUse.requiresPaymentForProductionExecution, true);
assert.equal(agentTools.requiresPaymentForAgentUse, false);
assert.equal(agentTools.requiresPaymentForProductionExecution, true);
assert.equal(access.requiresPaymentForAgentUse, false);
assert.equal(access.requiresPaymentForProductionExecution, true);

assert.deepEqual(agentUse.siteTools.freeTools, freeTools);
assert.deepEqual(agentUse.siteTools.paidTools, [paidTool]);
assert.deepEqual(agentTools.siteTools.freeTools, freeTools);
assert.deepEqual(agentTools.siteTools.paidTools, [paidTool]);
assert.deepEqual(access.surfaces.webMcp.freeTools, freeTools);
assert.deepEqual(access.surfaces.webMcp.paidTools, [paidTool]);

assert.deepEqual(discovery.freeTools, freeTools);
assert.deepEqual(discovery.paidTools, []);
assert.deepEqual(discovery.codeReadyPaidTools, [paidTool]);
assert.equal(discovery.paidToolDeploymentStatus, 'pending-production-worker-deploy');
assert.deepEqual(catalog.tools, freeTools);
assert.deepEqual(catalog.pendingDeploymentTools, [paidTool]);
assert.deepEqual(catalog.codeReadyTools, [...freeTools, paidTool]);
assert.deepEqual(agentUse.remoteMcp.deployedTools, freeTools);
assert.deepEqual(agentUse.remoteMcp.paidTools, []);
assert.deepEqual(agentUse.remoteMcp.codeReadyPaidTools, [paidTool]);
assert.equal(agentUse.remoteMcp.paidToolDeploymentStatus, 'pending-production-worker-deploy');
assert.deepEqual(agentTools.remoteMcp.deployedTools, freeTools);
assert.deepEqual(agentTools.remoteMcp.paidTools, []);
assert.deepEqual(agentTools.remoteMcp.codeReadyPaidTools, [paidTool]);
assert.equal(access.surfaces.remoteMcp.paidToolDeploymentStatus, 'pending-production-worker-deploy');

assert.deepEqual(TOOL_DEFINITIONS.map((tool) => tool.name), [...freeTools, paidTool]);
assert.equal(TOOL_DEFINITIONS.find((tool) => tool.name === paidTool).annotations.readOnlyHint, false);
assert.equal(TOOL_DEFINITIONS.find((tool) => tool.name === paidTool).annotations.destructiveHint, true);

assert.equal(payment.headers.paymentRequired, 'PAYMENT-REQUIRED');
assert.equal(payment.headers.paymentSignature, 'PAYMENT-SIGNATURE');
assert.equal(payment.headers.paymentResponse, 'PAYMENT-RESPONSE');
assert.equal(payment.explicitConfirmationField, 'confirmPayment');
assert.equal(payment.webMcpGeneratesPaymentSignature, false);
assert.equal(payment.agentAutopayRequiresCompatibleWalletOrFacilitator, true);

const webmcp = read('webmcp.js');
for (const name of [...freeTools, paidTool]) assert.match(webmcp, new RegExp(name));
assert.match(webmcp, /confirmPayment/);
assert.doesNotMatch(webmcp, /privateKey|seedPhrase|walletPassword/);

const paidExecution = read('paid-execution.js');
assert.match(paidExecution, /PAYMENT-REQUIRED/);
assert.match(paidExecution, /PAYMENT-SIGNATURE/);
assert.match(paidExecution, /PAYMENT-RESPONSE/);
assert.match(paidExecution, /payment_confirmation_required/);
assert.doesNotMatch(paidExecution, /privateKey|seedPhrase|walletPassword/);

const html = read('index.html');
assert.match(html, /hyperxosist_execute/);
assert.match(html, /Remote MCP Workerの明示的な本番デプロイ/);
assert.doesNotMatch(html, /<dt>Authentication<\/dt><dd>Bearer token<\/dd>/);

const readme = read('README.md');
assert.match(readme, /version-2\.6\.0/);
assert.match(readme, /\| \*\*Version\*\* \| 2\.6\.0 \|/);
assert.match(readme, /hyperxosist_execute/);
assert.match(readme, /pending-production-worker-deploy|explicit production Cloudflare Worker deployment/);
assert.doesNotMatch(readme, /api\.kgninja\.dev\/HyperXosist-Agent\/payment-options\.json/);
assert.doesNotMatch(readme, /Authentication: Bearer token/);
assert.doesNotMatch(readme, /API surface \(v2\.5\)/);

for (const file of ['README.md', 'index.html', 'docs/MCP.md', 'docs/CHATGPT_APP.md', 'workers/remote-mcp/README.md']) {
  assert.doesNotMatch(read(file), /2\.5\.0/);
}

console.log('Access policy consistency tests passed.');
"""


def update_readme() -> None:
    text, nl = read_preserved("README.md")
    text = text.replace("version-2.5.0-brightgreen", "version-2.6.0-brightgreen")
    text = text.replace("| **Version** | 2.5.0 |", "| **Version** | 2.6.0 |")
    text = text.replace("## API surface (v2.5)", "## API surface (v2.6)")
    text = text.replace(
        "人間の UI は無料。AI エージェントの本番利用は x402 支払い前提。",
        "人間UIとAgentのplanning / filtering / handoffは無料。production executionのみx402支払い対象です。",
    )
    text = text.replace(
        "https://api.kgninja.dev/HyperXosist-Agent/payment-options.json",
        "https://api.kgninja.dev/payment-options.json",
    )
    text = replace_section(text, "### ChatGPT Site Tools / WebMCP", "### MCP: Local and Remote", README_SITE_TOOLS, "README Site Tools")
    text = replace_section(text, "### MCP: Local and Remote", "### Agent handoff dry-run", README_MCP, "README MCP")
    text = replace_section(text, "### Payment policy (agents)", "### Free-to-paid Site Tool boundary", README_PAYMENT, "README payment")
    text = replace_section(text, "### Free-to-paid Site Tool boundary", "## Missions agents re-run", "", "README duplicate boundary")
    text = text.replace(
        "mcp/tools.js, mcp/core.js                  # Shared MCP schemas + dispatch\n",
        "paid-execution.js                         # Shared x402 402→signature→200 bridge\n"
        "webmcp.js                                 # Browser Site Tools adapter\n"
        "access-policy.json                        # Machine-readable free/paid boundary\n"
        "mcp/tools.js, mcp/core.js                  # Shared MCP schemas + dispatch\n",
    )
    text = text.replace(
        "- [ ] `agent-use.json` / `x402-payment.json` / `llms.txt` fetchable",
        "- [ ] `agent-use.json` / `x402-payment.json` / `access-policy.json` / `llms.txt` fetchable",
    )
    text = text.replace(
        "5. For automated production X search execution, POST the returned request to https://api.kgninja.dev/hyperxosist-query and complete x402 at 0.01 USDC on Base.",
        "5. For production execution, use `hyperxosist_execute`: inspect the unsigned 402 requirements, authorize with a compatible x402 wallet/facilitator, then retry once with explicit confirmation.",
    )
    write_preserved("README.md", text, nl)


def update_text_docs() -> None:
    write_preserved("docs/MCP.md", DOC_MCP, read_preserved("docs/MCP.md")[1])
    write_preserved("workers/remote-mcp/README.md", WORKER_README, read_preserved("workers/remote-mcp/README.md")[1])
    write_preserved("docs/CHATGPT_APP.md", CHATGPT_APP, read_preserved("docs/CHATGPT_APP.md")[1])

    text, nl = read_preserved("AGENTS.md")
    text = text.replace(
        "Agents pay via **x402** for automated production use.",
        "Planning, filtering, and handoff are free. Automated production execution uses **x402**.",
    )
    if "Production Remote MCP deployment status" not in text:
        text += """

## Production Remote MCP deployment status

- The public production Remote MCP currently exposes the three free tools.
- `hyperxosist_execute` is implemented and tested in the Worker source but requires an explicit production Worker deployment.
- Do not advertise the paid Remote MCP tool as deployed until live `tools/list` and `/.well-known/mcp.json` confirm it.
- GitHub Pages WebMCP calls the existing x402 endpoint directly and does not depend on that Worker deployment.
"""
    write_preserved("AGENTS.md", text, nl)

    text, nl = read_preserved("llms.txt")
    text = text.replace(
        "- Free MCP operations: `initialize`, `tools/list`, planning, filtering, and handoff",
        "- Free MCP operations: `initialize`, `tools/list`, planning, filtering, and handoff\n"
        "- Paid Remote MCP tool status: `hyperxosist_execute` is code-ready but requires an explicit production Worker deployment",
    )
    text = text.replace(
        "- WebMCP/MCP paid tool: hyperxosist_execute — x402 v2 production execution only; first call returns PAYMENT-REQUIRED, retry requires PAYMENT-SIGNATURE and confirmPayment=true.",
        "- WebMCP paid tool: hyperxosist_execute — available from the static site after Pages deployment.\n"
        "- Remote MCP paid tool: code-ready; production deployment pending.\n"
        "- x402 flow: first call returns PAYMENT-REQUIRED; retry requires PAYMENT-SIGNATURE and confirmPayment=true.",
    )
    write_preserved("llms.txt", text, nl)

    text, nl = read_preserved("CHANGELOG.md")
    text = text.replace(
        "- `hyperxosist_execute` as the single x402-paid production tool for WebMCP and Remote MCP.",
        "- `hyperxosist_execute` as the single x402-paid production tool for WebMCP, local MCP, and the Remote MCP Worker code path.",
    )
    text = text.replace(
        "- Paid execution and WebMCP boundary tests.",
        "- Paid execution, WebMCP boundary, and cross-manifest consistency tests.\n"
        "- Live unsigned endpoint probe confirming CORS preflight, 402, and standard x402 header exposure without making a payment.",
    )
    text = text.replace(
        "- Version bumped to 2.6.0.",
        "- Version bumped to 2.6.0.\n"
        "- Production Remote MCP deployment remains an explicit manual operation; static metadata marks the paid tool as pending until deployed.",
    )
    text = re.sub(
        r"## \[Unreleased\]\n.*?(?=\n## \[2\.5\.0\])",
        "## [Unreleased]\n\n- No unreleased changes.\n",
        text,
        count=1,
        flags=re.S,
    )
    write_preserved("CHANGELOG.md", text, nl)


def update_index() -> None:
    text, nl = read_preserved("index.html")
    text = text.replace(
        '<p><strong>有料:</strong> <code>hyperxosist_execute</code>（x402 v2 / 0.01 USDC / Base）。production search URL usage、automated external collection、<a href="https://api.kgninja.dev/hyperxosist-query">paid execution endpoint</a>。</p>',
        '<p><strong>有料コード:</strong> <code>hyperxosist_execute</code>（x402 v2 / 0.01 USDC / Base）。WebMCPでは既存x402 endpointを直接利用できます。Remote MCP版は実装・検証済みですが、公開endpointで有効にするにはRemote MCP Workerの明示的な本番デプロイが必要です。</p>',
    )
    text = text.replace(
        '<dt>Deployment status</dt><dd id="remoteMcpStatus">Deployed; verify Health before use</dd>',
        '<dt>Deployment status</dt><dd id="remoteMcpStatus">Free 3 tools deployed; paid tool Worker deploy pending</dd>',
    )
    write_preserved("index.html", text, nl)


def update_manifests() -> None:
    data, nl = load_json("agent-use.json")
    data["lastSynced"] = TODAY
    remote = data["remoteMcp"]
    remote["lastSynced"] = TODAY
    remote["deploymentStatus"] = "three free tools deployed; paid tool code ready; production Worker deploy pending"
    remote["deployedTools"] = FREE_TOOLS
    remote["paidTools"] = []
    remote["codeReadyPaidTools"] = [PAID_TOOL]
    remote["paidToolDeploymentStatus"] = "pending-production-worker-deploy"
    data["siteTools"]["deploymentStatus"] = "available after GitHub Pages deploy"
    data["siteTools"]["remoteMcpDependency"] = False
    dump_json("agent-use.json", data, nl)

    data, nl = load_json("agent-tools.json")
    data["lastSynced"] = TODAY
    remote = data["remoteMcp"]
    remote["deploymentStatus"] = "three free tools deployed; paid tool code ready; production Worker deploy pending"
    remote["deployedTools"] = FREE_TOOLS
    remote["paidTools"] = []
    remote["codeReadyPaidTools"] = [PAID_TOOL]
    remote["paidToolDeploymentStatus"] = "pending-production-worker-deploy"
    paid = data["paidToolDefinitions"][0]
    paid["availability"] = {
        "webMcp": "available after GitHub Pages deploy",
        "localMcp": "available in package 2.6.0",
        "remoteMcpProduction": "pending explicit production Worker deployment",
    }
    dump_json("agent-tools.json", data, nl)

    data, nl = load_json(".well-known/mcp.json")
    data["paidTools"] = []
    data["codeReadyPaidTools"] = [PAID_TOOL]
    data["paidToolDeploymentStatus"] = "pending-production-worker-deploy"
    data["paidExecution"]["availability"] = "direct x402 endpoint live; Remote MCP tool deploy pending"
    data["deploymentStatus"] = {
        "freeTools": "deployed",
        "paidTool": "code-ready; production Worker deployment required",
    }
    dump_json(".well-known/mcp.json", data, nl)

    data, nl = load_json("mcp-catalog.json")
    data["tools"] = FREE_TOOLS
    data["paidTools"] = []
    data["codeReadyTools"] = FREE_TOOLS + [PAID_TOOL]
    data["pendingDeploymentTools"] = [PAID_TOOL]
    data["status"] = "production-free-tools; paid-tool-code-ready"
    data["verificationScope"] = [
        "live free Remote MCP health",
        "live x402 CORS preflight",
        "live unsigned 402 and standard header exposure",
        "repository paid-tool tests",
    ]
    data["paidExecution"]["availability"] = "direct endpoint live; Remote MCP tool deploy pending"
    dump_json("mcp-catalog.json", data, nl, compact=True)

    data, nl = load_json("access-policy.json")
    remote = data["surfaces"]["remoteMcp"]
    remote["deployedTools"] = FREE_TOOLS
    remote["paidTools"] = []
    remote["codeReadyPaidTools"] = [PAID_TOOL]
    remote["paidToolDeploymentStatus"] = "pending-production-worker-deploy"
    remote["productionDeploymentIsManual"] = True
    data["surfaces"]["webMcp"]["deploymentStatus"] = "available after GitHub Pages deploy"
    data["verification"] = {
        "date": TODAY,
        "paidEndpoint": {
            "corsPreflightStatus": 204,
            "unsignedStatus": 402,
            "allowsPaymentSignature": True,
            "exposesPaymentRequired": True,
            "exposesPaymentResponse": True,
            "paymentPerformed": False,
        },
        "remoteMcpPaidTool": "not production-deployed by this change",
    }
    dump_json("access-policy.json", data, nl)

    data, nl = load_json("x402-payment.json")
    data["agentAutopayRequiresCompatibleWalletOrFacilitator"] = True
    data["webMcpGeneratesPaymentSignature"] = False
    data["confirmedPaymentAutoRetryAllowed"] = False
    data["remoteMcpPaidToolDeploymentStatus"] = "pending-production-worker-deploy"
    dump_json("x402-payment.json", data, nl)

    data, nl = load_json("package.json")
    scripts = data["scripts"]
    if "test:access-policy" not in scripts:
        scripts["test:access-policy"] = "node test/access-policy-consistency.test.js"
    if "node test/access-policy-consistency.test.js" not in scripts["test"]:
        scripts["test"] = scripts["test"].replace(
            "node test/payment-endpoints.test.js &&",
            "node test/payment-endpoints.test.js && node test/access-policy-consistency.test.js &&",
        )
    dump_json("package.json", data, nl)


def main() -> None:
    update_readme()
    update_text_docs()
    update_index()
    update_manifests()
    write_preserved("test/access-policy-consistency.test.js", CONSISTENCY_TEST, "\n")

    for rel in [
        "package.json",
        "agent-use.json",
        "agent-tools.json",
        ".well-known/mcp.json",
        "mcp-catalog.json",
        "access-policy.json",
        "x402-payment.json",
    ]:
        json.loads(p(rel).read_text(encoding="utf-8-sig"))

    print("Refined WebMCP x402 metadata, docs, deployment status, and consistency checks.")


if __name__ == "__main__":
    main()
