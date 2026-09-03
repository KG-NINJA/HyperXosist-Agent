# HyperXosist Remote MCP Worker

This Worker is the public Streamable HTTP adapter. It is separate from GitHub Pages, the local stdio server, the Node HTTP server, and the existing x402 payment endpoint.

## Security model

- Access mode is explicit. With `HYPERXOSIST_MCP_PUBLIC_FREE_ACCESS=true`, the three read-only production tools accept requests without client authentication. Otherwise `POST /mcp` requires `HYPERXOSIST_MCP_TOKEN` or a token-registry Bearer credential.
- `HYPERXOSIST_MCP_TOKEN_USERS` is an optional secret JSON registry keyed by SHA-256 token hash. Each value may set `userId`, `plan`, `status` (`active` or disabled), and `dailyLimit` (0 means unlimited). Raw tokens are never logged or stored.
- `HYPERXOSIST_MCP_DEFAULT_USER_ID`, `HYPERXOSIST_MCP_DEFAULT_PLAN`, and `HYPERXOSIST_MCP_DEFAULT_DAILY_LIMIT` identify and limit the legacy default token.
- `HYPERXOSIST_MCP_ALLOWED_ORIGINS` is a comma-separated allowlist. Browser-originated requests default closed.
- `HYPERXOSIST_MCP_ALLOWED_HOSTS` is a comma-separated hostname allowlist for the production custom domain.
- Only `POST /mcp`, CORS preflight, and `GET /health` are exposed. MCP is stateless JSON response mode and has a 1 MiB body limit.
- `HYPERXOSIST_PAYMENT_ENVIRONMENT=production` returns `https://api.kgninja.dev` execution URLs; use `staging` only for the existing staging payment Worker.
- Run this Worker behind a Cloudflare custom domain. Add a zone-level WAF rate-limiting rule for `POST /mcp`, grouped by source IP, before public release. `workers.dev` is staging only because it cannot use your domain-zone WAF policy.

## Local verification

Wrangler 4.110.0 requires Node.js 22 or newer for this Worker package. The root project remains compatible with Node.js 18 or newer.

```bash
npm ci
npm --prefix workers/remote-mcp ci
cp workers/remote-mcp/.dev.vars.example workers/remote-mcp/.dev.vars
npm --prefix workers/remote-mcp run check
npm --prefix workers/remote-mcp run dev
```

## Staged deployment

Do not set secrets in `wrangler.jsonc`.

```bash
cd workers/remote-mcp
npx wrangler secret put HYPERXOSIST_MCP_TOKEN --env staging
npx wrangler deploy --env staging
```

Production is configured for `mcp.kgninja.dev`. It disables `workers.dev` and preview URLs, sets the Host allowlist to that hostname, leaves browser origins empty, and currently enables public-free access for the three bounded read-only tools. Private deployments should disable public-free access and configure a production Bearer secret or token registry. Add the zone-level WAF/rate-limiting rule before deploying with `--env production` after a staged smoke test.

The Worker keeps planning, filtering, and handoff free. It does not call, replace, or alter the existing x402 payment endpoint.
## Operations and analytics

Every authenticated MCP request emits a structured `mcp_request` event to Worker logs with a request ID, sanitized user ID, plan, operation/tool, status, latency, client family, and timestamp. Authentication failures, quota blocks, rejected requests, and internal errors emit separate event names. Request bodies, prompts, tokens, payment headers, and wallet data are not logged.

- Cloudflare Observability is enabled in `wrangler.jsonc`; use Worker Logs for error monitoring and usage trends.
- If an `MCP_ANALYTICS` Analytics Engine binding is added, the same aggregate-safe events are written as data points.
- If an `MCP_USAGE_KV` KV binding is added, `dailyLimit` is enforced per user and UTC day. Without the binding, identity and logs still work but quotas are not enforced.
- Payment analysis remains in the existing x402 Worker: its D1 revenue/access/funnel summaries and Telegram notifications are authoritative. Remote MCP requests are free and are recorded with `paid: false`.

### Token registry example

Hash a token without printing the token:

```bash
printf %s "$AGENT_TOKEN" | sha256sum
```

Set `HYPERXOSIST_MCP_TOKEN_USERS` to JSON keyed by that hash, for example:

```json
{"sha256-token-hash":{"userId":"agent-a","plan":"pro","status":"active","dailyLimit":100}}
```
