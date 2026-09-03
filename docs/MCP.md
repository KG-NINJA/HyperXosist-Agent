# HyperXosist Model Context Protocol (MCP)

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
