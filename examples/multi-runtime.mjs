#!/usr/bin/env node
/**
 * HyperXosist Agent — multi-runtime integration sketch (offline).
 *
 * Shows the same sticky loop for:
 *   - OpenAI tools shape
 *   - Anthropic tools shape
 *   - dispatchToolCall (shared)
 *   - CLI-equivalent JSON
 *
 *   node examples/multi-runtime.mjs
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const Agent = require(join(root, 'agent-api.js'));

const intent = process.argv.slice(2).join(' ') ||
  'Find product feedback about Acme for PR specs';

console.log('=== HyperXosist multi-runtime demo v' + Agent.version + ' ===\n');

// 1) Schemas each runtime registers
const openaiTools = Agent.toOpenAITools();
const anthropicTools = Agent.toAnthropicTools();
console.log('OpenAI tools count:', openaiTools.length);
console.log('  first:', openaiTools[0].function.name);
console.log('Anthropic tools count:', anthropicTools.length);
console.log('  first:', anthropicTools[0].name, '(input_schema keys)', Object.keys(anthropicTools[0].input_schema.properties || {}).slice(0, 4).join(', '));

// 2) Simulate an OpenAI-style tool call from the model
const openAiCall = {
  function: {
    name: 'hyperxosist_plan_from_intent',
    arguments: JSON.stringify({ intent })
  }
};
const fromOpenAI = Agent.dispatchToolCall(openAiCall);
console.log('\nOpenAI-shaped dispatch ok=', fromOpenAI.ok, 'mission=', fromOpenAI.result && fromOpenAI.result.missionId);

// 3) Simulate an Anthropic-style tool call
const anthropicCall = {
  name: 'hyperxosist_plan_from_intent',
  input: { intent }
};
const fromAnthropic = Agent.dispatchToolCall(anthropicCall);
console.log('Anthropic-shaped dispatch ok=', fromAnthropic.ok, 'mission=', fromAnthropic.result && fromAnthropic.result.missionId);

// 4) Keep-only export for any coding agent
const samplePosts = [
  'Acme crashes when exporting CSV on Safari 17',
  'Please add SSO for team rollout of Acme',
  'love this so much game changer bookmark'
];
const keepOnly = Agent.exportKeepOnlyJson(samplePosts, {
  productName: 'Acme',
  targetArea: 'export / auth'
});
console.log('\nKeep-only:', keepOnly.keepCount, 'kept /', keepOnly.discardCount, 'discarded');
console.log('S2F feedback lines:', keepOnly.signalToFixInput.feedback.length);
console.log('Agent prompt headline:', (keepOnly.agentPrompt.markdown || '').split('\n')[0]);

console.log('\nDone. Same dispatch path works for GPT, Claude, Grok, Llama, and shell CLI.');
console.log('Shell equivalent: npx hyperxosist plan "' + intent + '" --json');
