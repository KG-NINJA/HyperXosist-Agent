'use strict';

const assert = require('node:assert');
const { createToolDispatcher } = require('../mcp/core.js');
const { TOOL_DEFINITIONS } = require('../mcp/tools.js');

async function main() {
  assert.strictEqual(TOOL_DEFINITIONS.length, 3);
  const dispatch = createToolDispatcher();

  const plan = await dispatch('hyperxosist_search_plan', {
    intent: 'Find user complaints, bugs, and feature requests on X about HyperXosist-Agent',
  });
  assert.strictEqual(plan.isError, undefined);
  assert.strictEqual(plan.structuredContent.type, 'hyperxosist.search_plan.v1');
  assert.ok(plan.structuredContent.queries.length > 1);
  assert.ok(
    plan.structuredContent.searchUrls.every((url) => url.startsWith('https://x.com/search'))
  );
  assert.ok(plan.structuredContent.qualityScores.every((score) => typeof score === 'number'));
  assert.strictEqual(plan.structuredContent.paymentPolicy.planning, 'free');
  assert.strictEqual(
    plan.structuredContent.paymentPolicy.automatedProductionExecution,
    'x402_required'
  );

  const filtered = await dispatch('hyperxosist_filter_signals', {
    feedback: [
      'HyperXosist crashes when generating a search URL on Safari 18.',
      'Please add a one-click copy button for MCP configuration.',
      'This is amazing, best product ever!',
      'GM giveaway airdrop 100x',
    ],
  });
  assert.strictEqual(filtered.structuredContent.keepCount, 2);
  assert.strictEqual(filtered.structuredContent.discardCount, 2);

  const handoff = await dispatch('hyperxosist_build_handoff', {
    productName: 'HyperXosist-Agent',
    feedback: [
      'HyperXosist crashes when generating a search URL on Safari 18.',
      'Please add a one-click copy button for MCP configuration.',
    ],
  });
  assert.strictEqual(handoff.structuredContent.type, 'hyperxosist.handoff.v1');
  assert.strictEqual(handoff.structuredContent.handoff.feedbackCount, 2);
  assert.strictEqual(
    handoff.structuredContent.signalToFixInput.productName,
    'HyperXosist-Agent'
  );
  assert.ok(handoff.structuredContent.agentPrompt.markdown);

  assert.strictEqual(
    (await dispatch('hyperxosist_search_plan', { intent: ' ' })).isError,
    true
  );
  assert.strictEqual(
    (await dispatch('hyperxosist_filter_signals', { feedback: ['ok', 42] })).isError,
    true
  );
  assert.strictEqual((await dispatch('unknown_tool', {})).isError, true);

  const failingDispatch = createToolDispatcher({
    startAgentSession() {
      throw new Error('SECRET_STACK_MARKER');
    },
  });
  const failure = await failingDispatch('hyperxosist_search_plan', { intent: 'X bugs' });
  assert.strictEqual(failure.isError, true);
  assert.doesNotMatch(failure.content[0].text, /SECRET_STACK_MARKER|at createToolDispatcher/);

  console.log('MCP core tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
