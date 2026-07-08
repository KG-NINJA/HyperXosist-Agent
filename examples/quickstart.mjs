#!/usr/bin/env node
/**
 * HyperXosist Agent — shareable quickstart (no network required for planning)
 *
 *   node examples/quickstart.mjs
 *   npm run quickstart
 *
 * Planning / scoring is free. Automated production use of search URLs
 * still requires x402 payment (see x402-payment.json).
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const Agent = require(join(root, 'agent-api.js'));

const intent =
  process.argv.slice(2).join(' ') ||
  'Find product feedback about DemoApp for PR specs';

console.log('HyperXosist Agent', Agent.version);
console.log('Intent:', intent);
console.log('');

const session = Agent.startAgentSession({ intent });
const plan = session.plan;

if (!plan || !plan.ok) {
  console.error('plan failed', plan);
  process.exit(1);
}

console.log('Mission:', plan.missionId, '—', plan.mission.label);
console.log(
  'Steps:',
  plan.mission.stepCount,
  '| est. paid calls:',
  plan.mission.estimatedPaidCalls,
  `| est. USD: $${plan.mission.estimatedCostUsd}`
);
console.log('');

plan.mission.steps.forEach((step) => {
  console.log(`#${step.index + 1} [${step.angleId}] score=${step.score.score} (${step.score.band}) pay=${step.score.recommendPay}`);
  console.log('  rationale:', step.rationale);
  console.log('  query:', step.query.slice(0, 140) + (step.query.length > 140 ? '…' : ''));
  console.log('  url:', step.searchUrl.slice(0, 100) + '…');
  console.log('');
});

const primary = plan.primaryStep;
console.log('--- Primary paid request (preview; pay before production use) ---');
console.log('POST', primary.paidRequest.endpoint);
console.log('expect unpaid status', primary.paidRequest.expectedUnpaidStatus);
console.log('body keys:', Object.keys(primary.paidRequest.body || {}));
console.log('');

const handoff = Agent.buildHandoffPackage({
  productName: plan.subject || 'DemoApp',
  feedback: [
    'DemoApp crashes when exporting CSV',
    'Please add SSO for team rollout'
  ]
});
console.log('--- Handoff package ready for Signal-to-Fix ---');
console.log('ready:', handoff.ready, 'feedbackCount:', handoff.feedbackCount);
console.log('signalToFix UI:', handoff.signalToFix.humanUi);
console.log('');

const receipt = Agent.buildRunReceipt({
  input: primary.input,
  paymentCompleted: false,
  resultCount: null,
  missionId: plan.missionId,
  angleId: primary.angleId,
  notes: 'quickstart dry-run (no payment performed)'
});
console.log('Receipt id:', receipt.id);
console.log('Reuse share URL host path includes #s=… length', receipt.reuse.encodedState.length);
console.log('');
console.log('Next: complete x402 on payment endpoint, collect posts, then handoff.');
console.log('Docs: https://kg-ninja.github.io/HyperXosist-Agent/AGENTS.md');
