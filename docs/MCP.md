# HyperXosist Model Context Protocol (MCP) Server

A minimal, high-performance, and standards-compliant **Model Context Protocol (MCP)** server for **HyperXosist-Agent**. This server allows AI IDEs (Cursor, VS Code Agent Mode) and LLM agents (Claude Code, OpenAI Responses API) to naturally use HyperXosist as an external tool for advanced query planning, signal filtering, and downstream developer handoffs.

---

## ⚠️ Important Scope Disclaimer

HyperXosist-Agent is a **query-planning and signal-filtering system**.
- It is **NOT** responsible for scraping X/Twitter.
- It does **NOT** make automated HTTP requests to X or store raw Twitter databases.
- The MCP server **only** exposes planning, filtering, and handoff capabilities. AI agents/IDE assistants must utilize the generated search URLs to open results or collect posts through the official X web interface before passing them back to the filter tools.

---

## 🌐 Connection Transport & Remote MCP Limitation

- **Stdio-Only Out-of-the-Box**: The current implementation in `mcp/server.js` is built and pre-configured **strictly for local stdio-based transport** (standard input/standard output) suitable for desktop environments (Cursor, Claude Code CLI, etc.).
- **Remote MCP Requirement**: Running HyperXosist as a Remote MCP Server (for example, on a central cloud instance or as an external SaaS utility) **requires an additional Streamable HTTP, SSE, or WebSocket adapter**. The default stdio code cannot be connected directly over the web without wrapping it in a network-aware transport layer.

---

## 🏗️ Architecture

```
                                  ┌───────────────────────────┐
                                  │   AI Assistant / LLM /    │
                                  │      IDE (Cursor, etc.)   │
                                  └─────────────┬─────────────┘
                                                │
                                                │ Stdio (JSON-RPC 2.0)
                                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  HyperXosist MCP Server (mcp/server.js)                                     │
│                                                                             │
│  ┌───────────────────────┐  ┌─────────────────────────┐  ┌───────────────┐  │
│  │ hyperxosist__         │  │ hyperxosist_            │  │ hyperxosist_  │  │
│  │ search_plan           │  │ filter_signals          │  │ build_handoff │  │
│  └───────────┬───────────┘  └────────────┬────────────┘  └───────┬───────┘  │
│              │                           │                       │          │
└──────────────┼───────────────────────────┼───────────────────────┼──────────┘
               │                           │                       │
               ▼                           ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Core Agent Engine (agent-api.js)                                           │
│                                                                             │
│  - planFromIntent()       - filterKeepSignals()      - buildHandoffPackage()│
└─────────────────────────────────────────────────────────────────────────────┘
```

The server is built on Node.js using the official `@modelcontextprotocol/sdk`. It communicates over standard input/output (`stdio`) using JSON-RPC 2.0 protocol specifications.

- **State Independence**: The server is stateless and runs fully sandboxed, ensuring immediate startup and maximum reliability.
- **Dynamic Imports**: Uses Node.js ES Module dynamic imports to interface with `@modelcontextprotocol/sdk` while keeping compatibility with the project's zero-compiler CommonJS base.

---

## 🔒 Security Considerations

1. **Zero Scraping & Sandboxing**: Because the tool performs no scraping or outgoing HTTP requests to social networks, it cannot leak user sessions, provoke IP bans, or run afoul of platform rate limits.
2. **Local Transport Only (By Default)**: The default standard configuration runs over `stdio`. Since the communication is process-to-process, there are no open TCP ports, network interfaces, or authentication tokens exposed to the public internet.
3. **Data Privacy**: Input queries and posts are processed entirely in-memory within the local Node.js process. No text data is logged, transmitted, or stored on external servers.
4. **x402 Compliance**: Generating query paths and planning is free. While production automation use of the search endpoint uses the `x402` payment model, the MCP server itself requires no credentials, wallets, or keys to run.

---

## 🛠️ Exposed MCP Tools

The server exposes only these three high-value capabilities initially, with descriptions explicitly optimized so LLMs naturally select them for user tasks:

### 1. `hyperxosist_search_plan`
Converts natural language research intents into high-signal, multi-angle search queries and official URLs.
- **Input**:
  ```json
  {
    "intent": "string" // The research or search intent
  }
  ```
- **Output**:
  ```json
  {
    "mission": {},        // Full details on query angles
    "queries": [],        // Generated raw X advanced search strings
    "searchUrls": [],     // Official search URLs with filters appended
    "estimatedCost": 0.03 // Estimated budget hint (USD)
  }
  ```
- **Internal API**: `startAgentSession()`, `planFromIntent()`

### 2. `hyperxosist_filter_signals`
Filters and scores raw feedback lines, separating technical bugs and UX friction from engagement bait or empty praise.
- **Input**:
  ```json
  {
    "feedback": ["string"] // List of copied raw posts/tweets
  }
  ```
- **Output**:
  ```json
  {
    "keep": [],    // List of scored high-signal posts with technical tags
    "discard": [], // Discarded noise items (giveaways, praise, bait)
    "summary": {}  // Summary of the technical focus area
  }
  ```
- **Internal API**: `filterKeepSignals()`

### 3. `hyperxosist_build_handoff`
Packages filtered signals into a developer specification handoff and outputs a model-agnostic prompt for code fixes.
- **Input**:
  ```json
  {
    "productName": "string",
    "feedback": ["string"]
  }
  ```
- **Output**:
  ```json
  {
    "handoff": {} // Full handoff JSON containing standard Signal-to-Fix pipelines and implementation prompts
  }
  ```
- **Internal API**: `buildHandoffPackage()`

---

## 🤖 Intent-Optimized Tool Selection

The metadata and descriptions inside `mcp/server.js` are optimized so that AI assistants (like Claude, GPT, Grok) naturally select `HyperXosist` tools when users ask:
- *“Find user complaints on X about my product”*
- *“Search product feedback for Acme”*
- *“Analyze feature requests on social media”*
- *“Monitor social media discussions”*
- *“Investigate bug reports from X”*
- *“Research community sentiment regarding our framework”*

---

## 🚀 Hosting & Deployment Guides

### 1. Hosting on a Virtual Private Server (VPS)
To host the stdio server locally or over a persistent system daemon, use **PM2**:

1. Clone and install dependencies:
   ```bash
   git clone https://github.com/KG-NINJA/HyperXosist-Agent.git
   cd HyperXosist-Agent
   npm install
   ```
2. Start the server via PM2 (for log tracking and auto-restarts):
   ```bash
   pm2 start "npm run mcp" --name "hyperxosist-mcp"
   ```
3. Alternatively, you can run an SSE (Server-Sent Events) or HTTP gateway to expose the MCP server over TCP ports with basic Bearer authentication.

### 2. Hosting on Cloudflare Workers
Because the official `@modelcontextprotocol/sdk` supports SSE (Server-Sent Events), you can run HyperXosist on serverless edge runtimes like Cloudflare Workers.

1. Install the `@modelcontextprotocol/sdk` on a Workers project.
2. In your Worker's `fetch` handler, expose an endpoint to accept SSE connections:
   ```javascript
   import { Server } from "@modelcontextprotocol/sdk/server/index.js";
   import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

   // ... initialize Server instance and register tools ...

   export default {
     async fetch(request, env, ctx) {
       const url = new URL(request.url);
       if (url.pathname === "/sse") {
         const transport = new SSEServerTransport("/messages", res);
         await server.connect(transport);
         // Return SSE stream response
       }
       // ... handle POST /messages client requests ...
     }
   }
   ```
3. Expose behind Cloudflare Access or a simple pre-shared `X-API-Key` header check.

---

## 🔌 Connection Examples

### 1. Claude Code (CLI)
You can configure Claude Code to use this MCP server globally or per-project:

#### Option A: Interactive Command (Recommended)
Run the following command inside Claude Code's CLI:
```bash
claude mcp add hyperxosist node /absolute/path/to/HyperXosist-Agent/mcp/server.js
```

#### Option B: Per-Project `.mcp.json`
Create a `.mcp.json` file in your repository root:
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

### 2. Claude Desktop (App)
Add the server configuration to your global Claude Desktop App configuration file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Add this configuration to the `mcpServers` object:
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

### 3. Cursor
Configure Cursor to run HyperXosist locally via **Settings**:
1. Open **Cursor Settings** > **Features** > **MCP**.
2. Click **+ Add New MCP Server**.
3. Set the configurations:
   - **Name**: `hyperxosist`
   - **Type**: `stdio`
   - **Command**: `node`
   - **Arguments**: `/absolute/path/to/HyperXosist-Agent/mcp/server.js`

### 4. VS Code Agent Mode (Cline, Roo Code, Roo Cline)
Add this configuration block to your VS Code MCP settings file (typically `clinediscover.json`, `cline_mcp_settings.json` or Roo Code configuration):

```json
{
  "mcpServers": {
    "hyperxosist-agent": {
      "command": "node",
      "args": [
        "/absolute/path/to/HyperXosist-Agent/mcp/server.js"
      ],
      "disabled": false
    }
  }
}
```

### 5. OpenAI Responses API MCP
You can use the official `@modelcontextprotocol/sdk` to bridge HyperXosist directly to OpenAI’s Assistant/Responses tool schemas in Node.js:

```javascript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["./mcp/server.js"]
});

const client = new Client({ name: "openai-bridge-client", version: "1.0.0" });
await client.connect(transport);

// Fetch the list of schemas to supply directly into OpenAI tool definitions
const toolsResult = await client.listTools();
console.log(toolsResult.tools);
```
