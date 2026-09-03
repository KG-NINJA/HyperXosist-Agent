/**
 * Local verification test for the HyperXosist MCP Server.
 * Sends JSON-RPC 2.0 messages to the server over stdio and asserts correct responses.
 */
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const assert = require('assert');

const serverPath = path.join(__dirname, '..', 'mcp', 'server.js');

function runTest() {
  console.log('Starting MCP Server stdio integration test...');

  const server = spawn(process.execPath, [serverPath]);
  let output = '';
  let errorOutput = '';

  server.stdout.on('data', (data) => {
    output += data.toString();
    handleData();
  });

  server.stderr.on('data', (data) => {
    errorOutput += data.toString();
  });

  server.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`MCP Server exited with code ${code}`);
      console.error('stderr:', errorOutput);
      process.exit(1);
    }
  });

  const queue = [
    {
      request: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {}
      },
      assert: (response) => {
        assert.strictEqual(response.jsonrpc, '2.0');
        assert.strictEqual(response.id, 1);
        const tools = response.result.tools;
        assert.ok(Array.isArray(tools));
        assert.strictEqual(tools.length, 4);
        const toolNames = tools.map(t => t.name).sort();
        assert.deepStrictEqual(toolNames, [
          'hyperxosist_build_handoff',
          'hyperxosist_execute',
          'hyperxosist_filter_signals',
          'hyperxosist_search_plan'
        ]);
        console.log('✓ tools/list verified successfully.');
      }
    },
    {
      request: {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'hyperxosist_search_plan',
          arguments: {
            intent: 'Find user complaints, bug reports, and feature requests on X about HyperXosist-Agent'
          }
        }
      },
      assert: (response) => {
        assert.strictEqual(response.jsonrpc, '2.0');
        assert.strictEqual(response.id, 2);
        const content = response.result.content;
        assert.ok(Array.isArray(content));
        assert.strictEqual(content[0].type, 'text');

        const payload = JSON.parse(content[0].text);
        assert.ok(payload.mission);
        assert.ok(Array.isArray(payload.queries));
        assert.ok(Array.isArray(payload.searchUrls));
        assert.strictEqual(typeof payload.estimatedCostUsd, 'number');
        assert.ok(payload.queries.length > 1);
        assert.ok(payload.searchUrls.every(url => url.startsWith('https://x.com/search')));

        assert.ok(payload.queries.some(q => q.includes('HyperXosist-Agent')));
        console.log('✓ hyperxosist_search_plan verified successfully.');
      }
    },
    {
      request: {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'hyperxosist_filter_signals',
          arguments: {
            feedback: [
              'HyperXosist crashes when generating a search URL on Safari 18.',
              'Please add a one-click copy button for MCP configuration.',
              'This is amazing, best product ever!',
              'GM giveaway airdrop 100x'
            ]
          }
        }
      },
      assert: (response) => {
        assert.strictEqual(response.jsonrpc, '2.0');
        assert.strictEqual(response.id, 3);
        const content = response.result.content;
        const payload = JSON.parse(content[0].text);
        assert.ok(Array.isArray(payload.keep));
        assert.ok(Array.isArray(payload.discard));
        assert.ok(payload.summary);

        assert.strictEqual(payload.keep.length, 2);
        assert.strictEqual(payload.discard.length, 2);
        console.log('✓ hyperxosist_filter_signals verified successfully.');
      }
    },
    {
      request: {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'hyperxosist_build_handoff',
          arguments: {
            productName: 'HyperXosist-Agent',
            feedback: [
              'HyperXosist crashes when generating a search URL on Safari 18.',
              'Please add a one-click copy button for MCP configuration.'
            ]
          }
        }
      },
      assert: (response) => {
        assert.strictEqual(response.jsonrpc, '2.0');
        assert.strictEqual(response.id, 4);
        const content = response.result.content;
        const payload = JSON.parse(content[0].text);
        assert.ok(payload.handoff);
        assert.strictEqual(payload.handoff.type, 'hyperxosist.handoff.v1');
        assert.strictEqual(payload.handoff.feedbackCount, 2);
        assert.strictEqual(payload.handoff.signalToFix.input.productName, 'HyperXosist-Agent');
        assert.strictEqual(typeof payload.handoff.agentPrompt.markdown, 'string');
        assert.ok(payload.handoff.agentPrompt.markdown.length > 0);
        console.log('✓ hyperxosist_build_handoff verified successfully.');
      }
    },
    {
      request: {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'hyperxosist_filter_signals',
          arguments: { feedback: ['valid report', 42] }
        }
      },
      assert: (response) => {
        assert.strictEqual(response.id, 5);
        assert.strictEqual(response.result.isError, true);
        assert.match(response.result.content[0].text, /array of .*strings/);
        console.log('[ok] invalid tool input returns an MCP error result.');
      }
    },
    {
      request: {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'hyperxosist_search_plan',
          arguments: { intent: '   ' }
        }
      },
      assert: (response) => {
        assert.strictEqual(response.id, 6);
        assert.strictEqual(response.result.isError, true);
        console.log('[ok] empty intent validation verified successfully.');
      }
    },
    {
      request: {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'unknown_tool',
          arguments: {}
        }
      },
      assert: (response) => {
        assert.strictEqual(response.id, 7);
        assert.strictEqual(response.result.isError, true);
        assert.match(response.result.content[0].text, /Unknown tool/);
        console.log('[ok] unknown tool error response verified successfully.');
      }
    },
  ];

  let currentStep = 0;

  function sendNext() {
    if (currentStep >= queue.length) {
      console.log('\nAll MCP Server integration tests passed successfully!');
      server.kill();
      process.exit(0);
    }
    const req = queue[currentStep].request;
    const msg = JSON.stringify(req) + '\n';
    server.stdin.write(msg);
  }

  // MCP protocol uses JSON-RPC 2.0 framing.
  // Responses can be split, so we parse line by line or accumulate complete JSON objects.
  let buffer = '';
  function handleData() {
    buffer += output;
    output = '';

    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep partial line

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const response = JSON.parse(line);
        if (response.id === queue[currentStep].request.id) {
          queue[currentStep].assert(response);
          currentStep++;
          sendNext();
        }
      } catch (err) {
        console.error('Failed to parse line:', line);
        console.error(err);
        server.kill();
        process.exit(1);
      }
    }
  }

  // Start the first request
  sendNext();

  // Safeguard timeout
  setTimeout(() => {
    console.error('Test timed out!');
    server.kill();
    process.exit(1);
  }, 10000);
}

runTest();
