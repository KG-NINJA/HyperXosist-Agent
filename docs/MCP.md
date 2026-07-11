# HyperXosist Model Context Protocol (MCP)

HyperXosist-Agent provides two adapters over one shared tool core:

- Local stdio: `mcp/server.js`
- Remote Streamable HTTP: `mcp/remote-server.js`, endpoint `POST /mcp`

Both adapters expose the same three read-only tools and use `agent-api.js` as the business-logic source of truth. GitHub Pages remains a static human UI and is not an MCP server.

## Tool scope

- `hyperxosist_search_plan`: specialized X research planning and official `x.com/search` URLs.
- `hyperxosist_filter_signals`: filtering of X post text that the caller already collected.
- `hyperxosist_build_handoff`: Signal-to-Fix input and a coding-agent prompt from collected feedback.

These tools are not general web search. They do not scrape X, call the X API, collect posts, post content, or persist input.

Each successful call returns text content plus `structuredContent`:

- `hyperxosist.search_plan.v1`
- `hyperxosist.signal_filter.v1`
- `hyperxosist.handoff.v1`

## Local stdio

Requirements: Node.js 18 or newer.

```bash
npm install
npm run mcp
```

Example local client configuration:

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

This works with Cursor, Claude Code, and VS Code-compatible clients that can launch a local stdio process. Logs go to stderr; stdout is reserved for MCP JSON-RPC.

## Remote Streamable HTTP

The implementation uses the official `@modelcontextprotocol/sdk` Streamable HTTP transport in stateless JSON-response mode. SSE is not required for these request-response tools.

```bash
export HYPERXOSIST_MCP_TOKEN="replace-with-a-long-random-secret"
export HOST=127.0.0.1
export PORT=8787
npm run mcp:remote
```

Endpoints:

- `POST /mcp`: Streamable HTTP MCP
- `GET /health`: health and auth-configuration status
- `GET /mcp`: 405 in stateless mode

Test locally:

```bash
curl http://127.0.0.1:8787/health
npm run test:mcp:remote
npm run test:mcp:security
```

### Environment variables

| Variable | Default | Purpose |
|---|---:|---|
| `HOST` | `127.0.0.1` | Bind address |
| `PORT` | `8787` | HTTP port |
| `HYPERXOSIST_MCP_TOKEN` | unset | Bearer token; mandatory for public deployment |
| `HYPERXOSIST_MCP_MAX_BODY_BYTES` | `1048576` | Request body limit |
| `HYPERXOSIST_MCP_TIMEOUT_MS` | `15000` | Request timeout |
| `HYPERXOSIST_MCP_ALLOWED_ORIGINS` | empty | Comma-separated browser origins; requests with Origin are rejected unless listed |
| `HYPERXOSIST_MCP_ALLOWED_HOSTS` | empty | Comma-separated public hostnames for deployment validation |
| `HYPERXOSIST_PAYMENT_ENVIRONMENT` | `production` | Payment URL profile: `production` returns `https://api.kgninja.dev`; `staging` preserves the existing Worker URL |

If the token is unset, the server starts for local development and prints a warning without printing any secret. Never expose that unauthenticated configuration publicly.

The server also accepts an injected `rateLimit` callback through `createRemoteServer()`. Production hosting must connect this extension point to a shared limiter or gateway. The built-in process does not claim distributed rate limiting.

## Security policy

- Require HTTPS and Bearer authentication for public endpoints.
- Keep secrets in environment or platform secret storage.
- Do not put tokens in URLs, images, Docker layers, logs, or Git.
- Origin checks default closed when an Origin header is present.
- Configure allowed hostnames behind a public reverse proxy.
- Requests require `application/json`.
- Oversized and malformed bodies receive bounded JSON-RPC errors.
- Internal exceptions never expose stack traces.
- Inputs are processed in memory and are not persisted.
- No unconditional wildcard CORS is enabled.
- Put production rate limiting, TLS, monitoring, and abuse controls at the gateway.

## OpenAI Responses API and GPT-5.x

A public HTTPS Remote MCP URL is required. GitHub Pages and local stdio paths cannot be supplied as `server_url`.

```bash
export OPENAI_API_KEY="..."
export HYPERXOSIST_MCP_URL="https://mcp.example.com/mcp"
export HYPERXOSIST_MCP_TOKEN="..."
export OPENAI_MODEL="gpt-5.5"
node examples/openai-remote-mcp.mjs
```

The example sends a Responses API MCP tool with `server_url`, allowed tool names, and an optional Authorization header. Run configuration validation without an API call:

```bash
npm run openai:remote-check
```

OpenAI currently documents GPT-5.5 as the generally available recommended model. GPT-5.6 is limited preview; accounts with an enabled GPT-5.6 model ID can set it through `OPENAI_MODEL` without code changes.

Official references:

- [OpenAI Responses API MCP tool fields](https://platform.openai.com/docs/api-reference/responses/create)
- [OpenAI models](https://developers.openai.com/api/docs/models)
- [MCP Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
- [MCP TypeScript SDK server guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md)

## Tool-selection evaluation

```bash
npm run test:tool-selection
```

The default run statically checks 20 positive and negative prompts. Optional live evaluation requires `EVALUATE_WITH_OPENAI=1`, `OPENAI_API_KEY`, and a reachable `HYPERXOSIST_MCP_URL`.

## Docker and hosting

```bash
docker build -t hyperxosist-remote-mcp .
docker run --rm -p 8787:8787 \
  -e HYPERXOSIST_MCP_TOKEN="replace-with-a-long-random-secret" \
  hyperxosist-remote-mcp
```

The image uses Node 20 slim, production dependencies, a non-root user, port 8787, and a health check. The same container can be placed behind HTTPS on a VPS, Render, Fly.io, or Railway. Configure the public hostname, token, rate limiting, and platform health checks.

### Cloudflare Worker public endpoint

`workers/remote-mcp/` is a separate Worker adapter that reuses `mcp/core.js` with the SDK's Web Standard Streamable HTTP transport. It does not run the Node `http` or stdio adapter in Workers, and it does not alter GitHub Pages or the existing x402 endpoint.

Use a Cloudflare custom domain for production, not a `workers.dev` hostname. Before a public deployment:

1. Set `HYPERXOSIST_MCP_TOKEN` with `wrangler secret put`; it is mandatory for `POST /mcp`.
2. Set `HYPERXOSIST_MCP_ALLOWED_HOSTS` to the exact custom hostname and only add `HYPERXOSIST_MCP_ALLOWED_ORIGINS` for browser clients that require it.
3. Create a zone-level Cloudflare WAF rate-limiting rule that matches `POST /mcp`, groups by source IP, and returns JSON `429`. Keep it at the Cloudflare edge; Workers module memory is not a distributed rate limiter.
4. Deploy staging first, test authenticated `initialize` and tool calls, then deploy production with the custom domain.

The checked-in production configuration binds the Worker to `mcp.kgninja.dev`, disables `workers.dev` and version preview URLs, and restricts the Host allowlist to that hostname. It deliberately leaves browser origins empty because Remote MCP clients are server-to-server by default.

The Worker exposes only `POST /mcp`, CORS preflight for an allowlisted browser origin, and `GET /health`. It enforces Bearer authentication, closed-by-default Origin and Host validation, a 1 MiB body limit, JSON-only requests, generic errors, and `no-store` responses. Production returns x402 execution URLs under `https://api.kgninja.dev`; staging preserves the existing `workers.dev` payment origin. Run `npm run test:mcp:cloudflare` and `npm run cloudflare:mcp:check` before deployment. See [Worker deployment details](../workers/remote-mcp/README.md).

## Free planning and x402 boundary

Remote MCP tool discovery and all three MCP calls are free. The Remote MCP endpoint must not return HTTP 402 for planning, filtering, or handoff.

```json
{
  "planning": "free",
  "humanManualSearch": "free",
  "automatedProductionExecution": "x402_required",
  "estimatedCostUsd": 0.01
}
```

A human may manually open a generated official X search URL for free. Automated production execution of generated search URLs uses the existing x402 endpoint documented in `x402-payment.json`. This change does not modify that endpoint, wallet, price, facilitator, verification, or settlement behavior.

## ChatGPT App preparation

See [CHATGPT_APP.md](CHATGPT_APP.md). A directory submission is intentionally not performed. A stable public HTTPS Remote MCP endpoint, production auth, policies, support contact, monitoring, and manual review are required first.

## Limitations

- No hosted Remote MCP URL is deployed by this repository change.
- Bearer token auth is suitable for controlled deployments; a public multi-user app may require OAuth/account linking.
- The in-process rate-limit hook needs a shared production implementation.
- No X scraping or X API integration is included.
