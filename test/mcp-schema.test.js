'use strict';

const assert = require('node:assert');
const { TOOL_DEFINITIONS } = require('../mcp/tools.js');
const { createToolDispatcher } = require('../mcp/core.js');

async function main() {
  assert.strictEqual(TOOL_DEFINITIONS.length, 4);
  for (const tool of TOOL_DEFINITIONS) {
    assert.strictEqual(tool.inputSchema.type, 'object');
    assert.strictEqual(tool.inputSchema.additionalProperties, false);
    assert.strictEqual(tool.outputSchema.type, 'object');
    assert.ok(Array.isArray(tool.outputSchema.required));
    assert.strictEqual(typeof tool.annotations.readOnlyHint, 'boolean');
    assert.strictEqual(typeof tool.annotations.destructiveHint, 'boolean');
  }

  const free = TOOL_DEFINITIONS.filter((tool) => tool.name !== 'hyperxosist_execute');
  assert.ok(free.every((tool) => tool.annotations.readOnlyHint === true));
  const paid = TOOL_DEFINITIONS.find((tool) => tool.name === 'hyperxosist_execute');
  assert.strictEqual(paid.annotations.readOnlyHint, false);
  assert.strictEqual(paid.annotations.destructiveHint, true);
  assert.strictEqual(paid.inputSchema.properties.confirmPayment.type, 'boolean');
  assert.strictEqual(paid.outputSchema.properties.type.const, 'hyperxosist.x402_execution.v1');

  const dispatch = createToolDispatcher();
  const cases = [
    [
      'hyperxosist_search_plan',
      { intent: 'Find complaints on X about Acme' },
      'hyperxosist.search_plan.v1',
    ],
    [
      'hyperxosist_filter_signals',
      { feedback: ['Acme crashes on Safari 18.'] },
      'hyperxosist.signal_filter.v1',
    ],
    [
      'hyperxosist_build_handoff',
      { productName: 'Acme', feedback: ['Acme crashes on Safari 18.'] },
      'hyperxosist.handoff.v1',
    ],
  ];

  for (const [name, args, expectedType] of cases) {
    const result = await dispatch(name, args);
    assert.strictEqual(result.structuredContent.type, expectedType);
    assert.deepStrictEqual(JSON.parse(result.content[0].text), JSON.parse(JSON.stringify(result.structuredContent)));
  }

  console.log('MCP schema tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
