# HyperXosist Model Context Protocol (MCP) Server

HyperXosist-Agent currently ships a local stdio MCP server at `mcp/server.js`. It runs on Node.js 18 or newer and exposes query planning, signal filtering, and coding-agent handoffs without scraping X or making network requests.

## Current scope

- Transport: local stdio using JSON-RPC 2.0.
- Local clients: Cursor, Claude Code, and VS Code-compatible MCP clients that can launch a process.
- Runtime: Node.js 18 or newer with `@modelcontextprotocol/sdk`.
- Network behavior: no X scraping, posting, or automatic search-result collection.
- Logging: protocol messages use stdout; diagnostics and shutdown messages use stderr.

GitHub Pages is the human-facing static HTML/CSS/JS interface. It does not run `mcp/server.js`, cannot launch a stdio process, and is not a Remote MCP endpoint.

## Tools

### `hyperxosist_search_plan`

Input:

```json
{
  "intent": "Find user complaints, bug reports, and feature requests on X about HyperXosist-Agent"
}
```

Returns a mission, multiple X search queries, `https://x.com/search` URLs, and a numeric estimated cost.

### `hyperxosist_filter_signals`

Input:

```json
{
  "feedback": [
    "HyperXosist crashes when generating a search URL on Safari 18.",
    "Please add a one-click copy button for MCP configuration."
  ]
}
```

Returns actionable `keep` signals, discarded noise, and a focus summary.

### `hyperxosist_build_handoff`

Input:

```json
{
  "productName": "HyperXosist-Agent",
  "feedback": [
    "HyperXosist crashes when generating a search URL on Safari 18.",
    "Please add a one-click copy button for MCP configuration."
  ]
}
```

Returns a Signal-to-Fix input package and a model-neutral coding-agent prompt.

## Install and run

```bash
npm install
npm run mcp
```

The server waits for MCP JSON-RPC messages on stdin. Run the integration test with:

```bash
npm run test:mcp
```

## Local client configuration

Use an absolute path in client configuration:

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

Claude Code can register the same local process:

```bash
claude mcp add hyperxosist node /absolute/path/to/HyperXosist-Agent/mcp/server.js
```

## Remote MCP limitation

The checked-in stdio server is not a public Remote MCP service. General ChatGPT and GPT-5.6 Sol clients cannot use the GitHub Pages URL or `mcp/server.js` as a Remote MCP endpoint.

That use case requires a separate network adapter, normally a Streamable HTTP Remote MCP endpoint. SSE may be appropriate for clients and runtimes that support it, but it is not the only recommended transport.

Cloudflare Workers cannot execute the Node.js stdio implementation unchanged. A Worker version must separately register the same tools against an HTTP transport and add authentication, origin policy, deployment configuration, and remote integration tests. No Remote MCP adapter is included in this repository today.

## Free planning and x402 boundary

Local MCP planning, filtering, and handoff generation are free and require no wallet or API key. The MCP tools generate search plans and URLs; they do not execute a paid search request.

Automated production use of the existing HyperXosist search endpoint remains behind the separately documented x402 payment flow. An unpaid request returns HTTP 402 and payment verification occurs at that endpoint, not on GitHub Pages and not inside the local stdio MCP server. This repository does not change the existing x402 endpoint or settlement behavior.

## Security notes

- Inputs are processed in memory by the local process.
- No raw X database is stored.
- No TCP port is opened by the stdio server.
- Do not print application logs to stdout because that would corrupt MCP framing; use stderr.
