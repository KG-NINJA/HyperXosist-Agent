/**
 * Zero-dependency tests for HyperXosistAgent (Node).
 * Run: node test/agent-api.test.js
 */
'use strict';

const assert = require('assert');
const path = require('path');
const Agent = require(path.join(__dirname, '..', 'agent-api.js'));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
  }
}

console.log(`HyperXosistAgent v${Agent.version}\n`);

test('version is 2.x', () => {
  assert.ok(Agent.version.startsWith('2.'));
});

test('buildQuery keywords + exact phrase', () => {
  const q = Agent.buildQuery({ keywords: 'cat', exactPhrase: 'hello world' });
  assert.strictEqual(q, 'cat "hello world"');
});

test('buildQuery from/to/mention strip @', () => {
  const q = Agent.buildQuery({
    fromUser: '@alice',
    toUser: '@bob',
    mentionUser: 'carol'
  });
  assert.ok(q.includes('from:alice'));
  assert.ok(q.includes('to:bob'));
  assert.ok(q.includes('@carol'));
});

test('buildQuery anyOf OR group', () => {
  const q = Agent.buildQuery({ anyOf: 'bug, broken, issue' });
  assert.strictEqual(q, '(bug OR broken OR issue)');
});

test('buildQuery engagement filters', () => {
  const q = Agent.buildQuery({
    keywords: 'x',
    minFaves: 10,
    minRetweets: 2,
    minReplies: 1
  });
  assert.ok(q.includes('min_faves:10'));
  assert.ok(q.includes('min_retweets:2'));
  assert.ok(q.includes('min_replies:1'));
});

test('buildQuery media and reply filters', () => {
  const q = Agent.buildQuery({
    keywords: 'demo',
    hasMedia: true,
    excludeReplies: true,
    verifiedOnly: true
  });
  assert.ok(q.includes('filter:media'));
  assert.ok(q.includes('-filter:replies'));
  assert.ok(q.includes('filter:verified'));
});

test('buildQuery hashtags and url domain', () => {
  const q = Agent.buildQuery({
    hashtags: 'AI agents',
    urlDomain: 'https://github.com/foo'
  });
  assert.ok(q.includes('#AI'));
  assert.ok(q.includes('#agents'));
  assert.ok(q.includes('url:github.com'));
});

test('noise medium adds excludes', () => {
  const q = Agent.buildQuery({
    keywords: 'test',
    noise: { enabled: true, preset: 'medium', removed: [] }
  });
  assert.ok(q.includes('-giveaway') || q.includes('-"giveaway"'));
  assert.ok(q.length > 20);
});

test('noise removed skips term', () => {
  const q = Agent.buildQuery({
    keywords: 'test',
    noise: { enabled: true, preset: 'low', removed: ['giveaway'] }
  });
  assert.ok(!q.includes('-giveaway'));
});

test('buildSearchUrl live vs top', () => {
  const live = Agent.buildSearchUrl({ keywords: 'a', mode: 'live' });
  const top = Agent.buildSearchUrl({ keywords: 'a', mode: 'top' });
  assert.ok(live.includes('f=live'));
  assert.ok(top.includes('f=top'));
  assert.ok(live.startsWith('https://x.com/search?'));
});

test('validateInput date order', () => {
  const v = Agent.validateInput({
    keywords: 'x',
    sinceDate: '2026-06-01',
    untilDate: '2026-01-01'
  });
  assert.strictEqual(v.valid, false);
  assert.ok(v.errors.some((e) => /sinceDate/i.test(e)));
});

test('validateInput onlyReplies vs excludeReplies', () => {
  const v = Agent.validateInput({
    keywords: 'x',
    onlyReplies: true,
    excludeReplies: true
  });
  assert.strictEqual(v.valid, false);
});

test('applyTemplate signal_to_fix', () => {
  const input = Agent.applyTemplate('signal_to_fix', { keywords: 'MyApp' });
  assert.strictEqual(input.keywords, 'MyApp');
  assert.ok(input.noise && input.noise.enabled);
  const q = Agent.buildQuery(input);
  assert.ok(q.includes('MyApp'));
  assert.ok(q.includes('OR') || q.includes('feedback'));
});

test('applyDatePreset 7d', () => {
  const range = Agent.applyDatePreset('7d', new Date('2026-07-08T12:00:00Z'));
  assert.strictEqual(range.untilDate, '2026-07-08');
  assert.strictEqual(range.sinceDate, '2026-07-01');
});

test('listTemplates non-empty', () => {
  const list = Agent.listTemplates();
  assert.ok(list.length >= 6);
  assert.ok(list.every((t) => t.id && t.label));
});

test('encodeState / decodeState roundtrip', () => {
  const original = { keywords: 'π test', minFaves: 5, noise: { enabled: true, preset: 'low', removed: [] } };
  const enc = Agent.encodeState(original);
  const dec = Agent.decodeState(enc);
  assert.deepStrictEqual(dec, original);
});

test('explainQuery returns multiline text', () => {
  const text = Agent.explainQuery({ keywords: 'foo', lang: 'en', mode: 'top' });
  assert.ok(text.includes('Keywords'));
  assert.ok(text.includes('Query:'));
});

test('buildBatch processes array', () => {
  const batch = Agent.buildBatch([
    { keywords: 'a' },
    { keywords: 'b', mode: 'top' }
  ]);
  assert.strictEqual(batch.length, 2);
  assert.ok(batch[0].searchUrl.includes('q='));
  assert.ok(batch[1].paidRequest.paymentRequired);
});

test('buildPaidRequest includes preview', () => {
  const req = Agent.buildPaidRequest({ keywords: 'paid-test', mode: 'live' });
  assert.strictEqual(req.paymentRequired, true);
  assert.strictEqual(req.expectedUnpaidStatus, 402);
  assert.ok(req.preview.query.includes('paid-test'));
  assert.ok(req.endpoint.includes('hyperxosist-query'));
});

test('analyzeQuery empty severity', () => {
  const a = Agent.analyzeQuery('');
  assert.strictEqual(a.severity, 'empty');
});

test('rawOperators appended', () => {
  const q = Agent.buildQuery({ keywords: 'x', rawOperators: 'list:dev' });
  assert.ok(q.endsWith('list:dev') || q.includes('list:dev'));
});

// --- v2.1 agent-sticky layer ---

test('scoreQuery rewards noise + engagement', () => {
  const weak = Agent.scoreQuery({ keywords: 'x' });
  const strong = Agent.scoreQuery({
    keywords: 'x',
    minFaves: 20,
    excludeReplies: true,
    noise: { enabled: true, preset: 'medium', removed: [] },
    sinceDate: '2026-07-01',
    untilDate: '2026-07-08'
  });
  assert.ok(strong.score > weak.score);
  assert.ok(strong.recommendPay);
});

test('planFromIntent feedback → mission', () => {
  const plan = Agent.planFromIntent('Find product feedback about Acme for PR specs');
  assert.strictEqual(plan.ok, true);
  assert.ok(plan.missionId);
  assert.ok(plan.mission.steps.length >= 2);
  assert.ok(plan.primaryStep.paidRequest.paymentRequired);
  assert.ok(plan.nextActions.length >= 3);
  assert.strictEqual(plan.subject, 'Acme');
  assert.ok(plan.primaryStep.query.includes('Acme'));
  assert.ok(!plan.primaryStep.query.includes('PR specs'));
});

test('buildMission product_feedback_radar', () => {
  const m = Agent.buildMission('product_feedback_radar', { subject: 'Acme' });
  assert.strictEqual(m.stepCount, 3);
  assert.ok(m.estimatedCostUsd > 0);
  m.steps.forEach((s) => {
    assert.ok(s.query.includes('Acme') || s.input.keywords === 'Acme');
    assert.ok(s.score && typeof s.score.score === 'number');
  });
});

test('suggestRefinements sparse widens', () => {
  const input = {
    keywords: 'rarething',
    minFaves: 50,
    noise: { enabled: true, preset: 'high', removed: [] }
  };
  const r = Agent.suggestRefinements(input, { tooSparse: true });
  assert.ok(r.variants.some((v) => v.id === 'widen'));
  assert.ok(r.best);
});

test('buildHandoffPackage ready', () => {
  const h = Agent.buildHandoffPackage({
    productName: 'Acme',
    feedback: ['crash on login', 'please add dark mode']
  });
  assert.strictEqual(h.ready, true);
  assert.strictEqual(h.feedbackCount, 2);
  assert.ok(h.signalToFix.input.feedback.length === 2);
  assert.ok(h.policy.downstreamMustUseKeepOnly);
});

test('buildRunReceipt has reuse state', () => {
  const rec = Agent.buildRunReceipt({
    input: { keywords: 'Acme', mode: 'live' },
    paymentCompleted: true,
    resultCount: 4
  });
  assert.ok(rec.reuse.encodedState);
  assert.ok(rec.reuse.shareUrl.includes('#s='));
  assert.strictEqual(rec.payment.completed, true);
});

test('getToolDefinitions has plan tool', () => {
  const t = Agent.getToolDefinitions();
  assert.ok(t.tools.some((x) => x.function.name === 'hyperxosist_plan_from_intent'));
  assert.ok(t.dispatchHints.hyperxosist_build_handoff);
});

test('startAgentSession with intent', () => {
  const s = Agent.startAgentSession({ intent: 'Weekly monitor about NovaApp' });
  assert.ok(s.playbook.loop.length >= 5);
  assert.ok(s.plan && s.plan.ok);
  assert.ok(s.tools.tools.length >= 5);
});

test('composeCampaign multi goal', () => {
  const c = Agent.composeCampaign({
    product: 'Acme',
    goals: ['feedback', 'competitor'],
    locales: ['', 'ja']
  });
  assert.ok(c.stepCount >= 4);
  assert.ok(c.estimatedPaidCalls >= 1);
});

test('listMissions non-empty', () => {
  assert.ok(Agent.listMissions().length >= 5);
});

test('version is 2.1+', () => {
  assert.ok(Agent.version.startsWith('2.1') || Number(Agent.version.split('.')[1]) >= 1);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
