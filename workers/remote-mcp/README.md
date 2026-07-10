# HyperXosist Remote MCP Worker

This Worker is the public Streamable HTTP adapter. It is separate from GitHub Pages, the local stdio server, the Node HTTP server, and the existing x402 payment endpoint.

## Security model

- `HYPERXOSIST_MCP_TOKEN` is a required Cloudflare secret. Requests to `POST /mcp` without the matching `Authorization: Bearer` header are rejected.
- `HYPERXOSIST_MCP_ALLOWED_ORIGINS` is a comma-separated allowlist. Browser-originated requests default closed.
- `HYPERXOSIST_MCP_ALLOWED_HOSTS` is a comma-separated hostname allowlist for the production custom domain.
- Only `POST /mcp`, CORS preflight, and `GET /health` are exposed. MCP is stateless JSON response mode and has a 1 MiB body limit.
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

Before production, configure a Cloudflare custom domain, set `HYPERXOSIST_MCP_ALLOWED_HOSTS` to that hostname, set a narrow origin allowlist only when browser clients are required, add the zone-level WAF/rate-limiting rule, and deploy with `--env production` after a staged smoke test.

The Worker keeps planning, filtering, and handoff free. It does not call, replace, or alter the existing x402 payment endpoint.
