'use strict';

const assert = require('node:assert');
const path = require('node:path');
const { createRemoteServer } = require('../mcp/remote-server.js');

async function main() {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
  const { StreamableHTTPClientTransport } = await import(
    '@modelcontextprotocol/sdk/client/streamableHttp.js'
  );

  const stdioTransport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(__dirname, '..', 'mcp', 'server.js')],
    stderr: 'pipe',
  });
  const stdioClient = new Client({ name: 'stdio-consistency-test', version: '1.0.0' });
  await stdioClient.connect(stdioTransport);

  const remote = createRemoteServer({
    host: '127.0.0.1',
    port: 0,
    token: 'consistency-token',
  });
  const address = await remote.start();
  const remoteTransport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${address.port}/mcp`),
    { requestInit: { headers: { Authorization: 'Bearer consistency-token' } } }
  );
  const remoteClient = new Client({ name: 'remote-consistency-test', version: '1.0.0' });
  await remoteClient.connect(remoteTransport);

  try {
    const input = {
      name: 'hyperxosist_search_plan',
      arguments: { intent: 'Find complaints on X about Acme' },
    };
    const stdioResult = await stdioClient.callTool(input);
    const remoteResult = await remoteClient.callTool(input);
    for (const key of [
      'type',
      'missionId',
      'queries',
      'searchUrls',
      'qualityScores',
      'estimatedCostUsd',
      'requiresPaymentForAutomatedProductionUse',
      'paymentPolicy',
    ]) {
      assert.deepStrictEqual(remoteResult.structuredContent[key], stdioResult.structuredContent[key]);
    }
  } finally {
    await stdioClient.close().catch(() => {});
    await remoteClient.close().catch(() => {});
    await remote.stop();
  }

  console.log('stdio and Remote MCP output consistency tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
