#!/usr/bin/env node
'use strict';

const { createMcpServer } = require('./core.js');

async function main() {
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const server = await createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  let closing = false;
  const cleanup = async () => {
    if (closing) return;
    closing = true;
    console.error('Shutting down HyperXosist stdio MCP server.');
    try {
      await server.close();
    } catch (_error) {
      console.error('HyperXosist stdio MCP shutdown failed.');
    }
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.stdin.on('close', cleanup);
}

if (require.main === module) {
  main().catch(() => {
    console.error('HyperXosist stdio MCP failed to start.');
    process.exit(1);
  });
}

module.exports = { main };
