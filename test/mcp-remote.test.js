'use strict';

const assert = require('node:assert');
const { createRemoteServer } = require('../mcp/remote-server.js');

async function main() {
  const remote = createRemoteServer({
    host: '127.0.0.1',
    port: 0,
    token: 'remote-test-token',
  });
  const address = await remote.start();

  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StreamableHTTPClientTransport } = await import(
    '@modelcontextprotocol/sdk/client/streamableHttp.js'
  );
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${address.port}/mcp`),
    {
      requestInit: {
        headers: { Authorization: 'Bearer remote-test-token' },
      },
    }
  );
  const client = new Client({ name: 'hyperxosist-remote-test', version: '1.0.0' });

  try {
    await client.connect(transport);
    const listed = await client.listTools();
    assert.deepStrictEqual(
      listed.tools.map((tool) => tool.name).sort(),
      [
        'hyperxosist_build_handoff',
        'hyperxosist_filter_signals',
        'hyperxosist_search_plan',
      ]
    );

    const plan = await client.callTool({
      name: 'hyperxosist_search_plan',
      arguments: {
        intent: 'Find user complaints, bugs, and feature requests on X about HyperXosist-Agent',
      },
    });
    assert.strictEqual(plan.structuredContent.type, 'hyperxosist.search_plan.v1');
    assert.ok(plan.structuredContent.queries.length > 1);
    assert.ok(
      plan.structuredContent.searchUrls.every((url) => url.startsWith('https://x.com/search'))
    );

    const filtered = await client.callTool({
      name: 'hyperxosist_filter_signals',
      arguments: {
        feedback: [
          'HyperXosist crashes when generating a search URL on Safari 18.',
          'Please add a one-click copy button for MCP configuration.',
          'This is amazing, best product ever!',
          'GM giveaway airdrop 100x',
        ],
      },
    });
    assert.strictEqual(filtered.structuredContent.keepCount, 2);
    assert.strictEqual(filtered.structuredContent.discardCount, 2);

    const handoff = await client.callTool({
      name: 'hyperxosist_build_handoff',
      arguments: {
        productName: 'HyperXosist-Agent',
        feedback: [
          'HyperXosist crashes when generating a search URL on Safari 18.',
          'Please add a one-click copy button for MCP configuration.',
        ],
      },
    });
    assert.strictEqual(handoff.structuredContent.handoff.feedbackCount, 2);
    assert.ok(handoff.structuredContent.signalToFixInput);
    assert.ok(handoff.structuredContent.agentPrompt.markdown);

    const unknown = await client.callTool({ name: 'unknown_tool', arguments: {} });
    assert.strictEqual(unknown.isError, true);
  } finally {
    await client.close().catch(() => {});
    await remote.stop();
  }

  console.log('Remote MCP integration tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
