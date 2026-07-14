'use strict';

const assert = require('node:assert');
const { createRemoteServer } = require('../mcp/remote-server.js');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

function request(url, options = {}) {
  return fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      ...options.headers,
    },
    body: options.body,
  });
}

async function main() {
  const remote = createRemoteServer({
    host: '127.0.0.1',
    port: 0,
    token: 'security-token',
    maxBodyBytes: 256,
    allowedOrigins: ['https://trusted.example'],
  });
  const address = await remote.start();
  const base = `http://127.0.0.1:${address.port}`;
  const mcpUrl = `${base}/mcp`;

  try {
    const health = await fetch(`${base}/health`);
    assert.strictEqual(health.status, 200);
    assert.strictEqual((await health.json()).authConfigured, true);

    assert.strictEqual(
      (await request(mcpUrl, {
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })).status,
      401
    );
    assert.strictEqual(
      (await request(mcpUrl, {
        headers: {
          Authorization: 'Bearer wrong-token',
          'Content-Type': 'application/json',
        },
        body: '{}',
      })).status,
      401
    );
    assert.strictEqual(
      (await request(mcpUrl, {
        headers: { Authorization: 'Bearer security-token', 'Content-Type': 'text/plain' },
        body: '{}',
      })).status,
      415
    );
    assert.strictEqual(
      (await request(mcpUrl, {
        headers: {
          Authorization: 'Bearer security-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value: 'x'.repeat(400) }),
      })).status,
      413
    );

    const malformed = await request(mcpUrl, {
      headers: {
        Authorization: 'Bearer security-token',
        'Content-Type': 'application/json',
      },
      body: '{bad',
    });
    assert.strictEqual(malformed.status, 400);
    assert.doesNotMatch(await malformed.text(), /stack|node_modules|at /i);

    assert.strictEqual(
      (await request(mcpUrl, {
        headers: {
          Authorization: 'Bearer security-token',
          'Content-Type': 'application/json',
          Origin: 'https://evil.example',
        },
        body: '{}',
      })).status,
      403
    );

    const allowedOrigin = await request(mcpUrl, {
      headers: {
        Authorization: 'Bearer security-token',
        'Content-Type': 'application/json',
        Origin: 'https://trusted.example',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });
    assert.notStrictEqual(allowedOrigin.status, 403);
  } finally {
    await remote.stop();
  }


  const failingRemote = createRemoteServer({
    host: '127.0.0.1',
    port: 0,
    token: 'failing-token',
    agent: {
      startAgentSession() {
        throw new Error('PRIVATE_STACK_MARKER');
      },
    },
  });
  const failingAddress = await failingRemote.start();
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StreamableHTTPClientTransport } = await import(
    '@modelcontextprotocol/sdk/client/streamableHttp.js'
  );
  const failingTransport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${failingAddress.port}/mcp`),
    { requestInit: { headers: { Authorization: 'Bearer failing-token' } } }
  );
  const failingClient = new Client({ name: 'security-error-test', version: '1.0.0' });
  try {
    await failingClient.connect(failingTransport);
    const result = await failingClient.callTool({
      name: 'hyperxosist_search_plan',
      arguments: { intent: 'Find bugs on X about Acme' },
    });
    assert.strictEqual(result.isError, true);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_STACK_MARKER|node_modules| at /);
  } finally {
    await failingClient.close().catch(() => {});
    await failingRemote.stop();
  }


  const unsafeStart = spawnSync(
    process.execPath,
    [path.join(__dirname, '..', 'mcp', 'remote-server.js')],
    {
      env: { ...process.env, HOST: '0.0.0.0', PORT: '0', HYPERXOSIST_MCP_TOKEN: '' },
      encoding: 'utf8',
      timeout: 5000,
    }
  );
  assert.strictEqual(unsafeStart.status, 1);
  assert.doesNotMatch(unsafeStart.stderr, /Bearer [A-Za-z0-9]|security-token|failing-token/);

  const limitedRemote = createRemoteServer({
    host: '127.0.0.1',
    port: 0,
    token: 'limit-token',
    rateLimit: async () => false,
  });
  const limitedAddress = await limitedRemote.start();
  try {
    const limited = await request(`http://127.0.0.1:${limitedAddress.port}/mcp`, {
      headers: {
        Authorization: 'Bearer limit-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });
    assert.strictEqual(limited.status, 429);
  } finally {
    await limitedRemote.stop();
  }

  console.log('Remote MCP security tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
