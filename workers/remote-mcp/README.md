# HyperXosist Remote MCP Worker

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
