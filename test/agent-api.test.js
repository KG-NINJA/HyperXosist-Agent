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


test('buildSignalToFixPipeline plans and handoffs', () => {
  const p = Agent.buildSignalToFixPipeline({ productName: 'Acme', lang: 'en' });
  assert.strictEqual(p.type, 'hyperxosist.signal_to_fix_pipeline.v1');
  assert.ok(p.humanManual && p.humanManual.steps.length >= 5);
  assert.ok(p.agentAuto && p.agentAuto.steps.length >= 4);
  assert.ok(p.links && p.links.signalToFixHumanUi);
  assert.ok(p.plan && p.plan.primaryStep && p.plan.primaryStep.query);
  assert.strictEqual(p.readyForHandoff, false);

  const p2 = Agent.buildSignalToFixPipeline({
    productName: 'Acme',
    feedback: ['login is broken when I click submit', 'please add dark mode'],
    targetArea: 'auth'
  });
  assert.strictEqual(p2.readyForHandoff, true);
  assert.ok(p2.handoff && p2.handoff.ready);
  assert.ok(p2.handoff.signalToFix.input.feedback.length === 2);
  assert.ok(Agent.getSignalToFixLinks().pipelineManifest.includes('signal-to-fix-pipeline.json'));
});

test('version is 2.3+', () => {
  assert.ok(Agent.version.startsWith('2.3') || Number(Agent.version.split('.')[1]) >= 3);
});

// --- v2.2 Grok Build layer ---

test('scoreTechnicalDepth rewards bugs over praise', () => {
  const bug = Agent.scoreTechnicalDepth('App crashes on login with error 500 after upgrade to 2.1');
  const praise = Agent.scoreTechnicalDepth('so good!!! love this');
  assert.ok(bug.score > praise.score);
  assert.ok(bug.tags.includes('bug') || bug.score >= 40);
  assert.ok(praise.score < 40);
});

test('filterKeepSignals keeps actionable only', () => {
  const r = Agent.filterKeepSignals([
    'love this',
    'please add dark mode to settings',
    'crash when I open modal on Safari',
    'ratio + skill issue'
  ]);
  assert.ok(r.keepCount >= 2);
  assert.ok(r.discardCount >= 1);
  assert.ok(r.focusSummary.headline);
  assert.ok(r.keep.every((k) => k.decision === 'keep'));
});

test('buildAgentPrompt universal structure', () => {
  const p = Agent.buildAgentPrompt({
    productName: 'Acme',
    targetArea: 'auth',
    context: 'Next.js app',
    feedback: [
      'login button does nothing on Safari',
      'so good',
      'session expires too fast after 2 minutes'
    ]
  });
  assert.ok(p.markdown.includes('## Agent Implementation Task'));
  assert.ok(p.markdown.includes('**Product**: Acme'));
  assert.ok(p.markdown.includes('exactly one small improvement'));
  assert.ok(p.ready);
  assert.strictEqual(p.flavor, 'universal');
});

test('buildGrokBuildPrompt structure', () => {
  const p = Agent.buildGrokBuildPrompt({
    productName: 'Acme',
    targetArea: 'auth',
    context: 'Next.js app',
    feedback: [
      'login button does nothing on Safari',
      'so good',
      'session expires too fast after 2 minutes'
    ]
  });
  assert.ok(p.markdown.includes('## Grok Build Task'));
  assert.ok(p.markdown.includes('**Product**: Acme'));
  assert.ok(p.markdown.includes('1つだけ小さな改善'));
  assert.ok(p.ready);
  assert.ok(p.keepSignals.length >= 1);
  assert.ok(!p.markdown.includes('so good') || p.keepSignals.every((k) => k.text !== 'so good'));
});

test('createGrokBuildSession forces grok mission', () => {
  const s = Agent.createGrokBuildSession('Find issues about NovaApp', {
    product: 'NovaApp',
    targetArea: 'search',
    context: 'static JS search tool'
  });
  assert.strictEqual(s.type, 'hyperxosist.grok_build_session.v1');
  assert.ok(s.grokBuild);
  assert.ok(s.grokBuild.promptTemplate.includes('Grok Build Task'));
  assert.ok(s.plan && s.plan.ok);
  assert.ok(
    [
      'grok_code_improvement_radar',
      'ui_ux_feedback_harvest',
      'performance_complaint_detector'
    ].includes(s.plan.missionId)
  );
  assert.strictEqual(s.grokBuild.handoffToFix, true);
});

test('buildMission grok_code_improvement_radar', () => {
  const m = Agent.buildMission('grok_code_improvement_radar', { subject: 'Acme' });
  assert.ok(m.stepCount >= 2);
  assert.strictEqual(m.recommendedNext, 'grok_build');
  assert.ok(m.steps.every((s) => s.query && s.query.includes('Acme')));
});

test('planFromIntent universal has markdown dual format', () => {
  const plan = Agent.planFromIntent('Find product feedback about Acme');
  assert.strictEqual(plan.ok, true);
  assert.strictEqual(plan.mode, 'universal');
  assert.ok(plan.markdown && plan.markdown.includes('HyperXosist plan'));
  assert.ok(typeof plan.asJson === 'function');
  assert.ok(!plan.nextActions.some((a) => a.action === 'grok_build_prompt'));
  assert.ok(plan.nextActions.some((a) => a.action === 'build_agent_prompt'));
});

test('planFromIntent grok mode includes grok action', () => {
  const plan = Agent.planFromIntent('Grok Build code improvement for WidgetX', { mode: 'grok' });
  assert.strictEqual(plan.ok, true);
  assert.strictEqual(plan.missionId, 'grok_code_improvement_radar');
  assert.strictEqual(plan.mode, 'grok');
  assert.ok(plan.nextActions.some((a) => a.action === 'grok_build_prompt'));
});

test('handoff universal has agentPrompt not grokBuild by default', () => {
  const h = Agent.buildHandoffPackage({
    productName: 'Acme',
    targetArea: 'UI',
    context: 'dark mode missing',
    feedback: ['button is hard to press on mobile', 'great app!!!']
  });
  assert.ok(h.agentPrompt);
  assert.ok(h.agentPrompt.markdown.includes('Agent Implementation Task'));
  assert.ok(!h.grokBuild);
  assert.ok(h.markdown);
});

test('handoff grok mode includes grokBuild', () => {
  const h = Agent.buildHandoffPackage({
    productName: 'Acme',
    targetArea: 'UI',
    context: 'dark mode missing',
    feedback: ['button is hard to press on mobile', 'great app!!!'],
    mode: 'grok'
  });
  assert.ok(h.grokBuild);
  assert.ok(h.grokBuild.prompt.includes('Grok Build Task'));
  assert.ok(h.grokBuild.keepSignals.length >= 1);
});

test('scoreQuery dual format', () => {
  const s = Agent.scoreQuery({
    keywords: 'Acme',
    noise: { enabled: true, preset: 'medium', removed: [] },
    minFaves: 5
  });
  assert.ok(s.markdown.includes('Query score'));
  assert.ok(s.recommendPay);
});

test('exportNoiseCatalog and customizeNoiseRules', () => {
  const before = Agent.exportNoiseCatalog();
  assert.ok(before.rules.low.length >= 1);
  assert.ok(before.markdown.includes('Noise Catalog'));
  Agent.customizeNoiseRules({ low: ['customspamtermxyz'] });
  const q = Agent.buildQuery({
    keywords: 'x',
    noise: { enabled: true, preset: 'low', removed: [] }
  });
  assert.ok(q.includes('customspamtermxyz'));
  Agent.resetNoiseRules();
  const after = Agent.exportNoiseCatalog();
  assert.ok(!after.rules.low.includes('customspamtermxyz'));
});

test('noise.extraTerms always applied', () => {
  const q = Agent.buildQuery({
    keywords: 'test',
    noise: { enabled: true, preset: 'low', removed: [], extraTerms: ['mybrandspam'] }
  });
  assert.ok(q.includes('mybrandspam') || q.includes('-mybrandspam'));
});

test('getToolDefinitions universal omits grok tools by default', () => {
  const t = Agent.getToolDefinitions();
  assert.strictEqual(t.mode, 'universal');
  assert.ok(t.tools.some((x) => x.function.name === 'hyperxosist_build_agent_prompt'));
  assert.ok(!t.tools.some((x) => x.function.name === 'hyperxosist_build_grok_prompt'));
  const g = Agent.getToolDefinitions({ includeGrok: true });
  assert.ok(g.tools.some((x) => x.function.name === 'hyperxosist_build_grok_prompt'));
});

test('startAgentSession default universal', () => {
  const s = Agent.startAgentSession({ intent: 'Find feedback about Acme' });
  assert.strictEqual(s.mode, 'universal');
  assert.ok(s.noise && s.noise.rules);
  assert.ok(!s.tools.tools.some((x) => x.function.name === 'hyperxosist_create_grok_session'));
});

test('noise medium includes grok waste terms', () => {
  const terms = Agent.getPresetTerms('medium');
  assert.ok(terms.some((t) => /love this|skill issue|giveaway/i.test(t)));
});

test('applyTemplate grok_code_improvement', () => {
  const input = Agent.applyTemplate('grok_code_improvement', { keywords: 'MyApp' });
  assert.ok(input.noise && input.noise.preset === 'high');
  assert.ok(Agent.buildQuery(input).includes('MyApp'));
});


test('agent-handoff-dryrun example prints full offline pipeline', () => {
  const { spawnSync } = require('child_process');
  const path = require('path');
  const script = path.join(__dirname, '..', 'examples', 'agent-handoff-dryrun.mjs');
  const result = spawnSync(process.execPath, [script, 'DryRunProduct'], {
    encoding: 'utf8',
    timeout: 15000,
    env: { ...process.env, NO_COLOR: '1' }
  });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  const out = (result.stdout || '') + (result.stderr || '');
  assert.ok(/PLANNING/i.test(out), 'planning section');
  assert.ok(/GENERATED SEARCH URL/i.test(out), 'search URL section');
  assert.ok(/SAMPLE FEEDBACK/i.test(out), 'sample feedback section');
  assert.ok(/KEEP \/ DISCARD|KEEP \(actionable/i.test(out), 'keep/discard section');
  assert.ok(/SIGNAL-TO-FIX HANDOFF/i.test(out), 'handoff section');
  assert.ok(/CODING-AGENT PROMPT/i.test(out), 'coding prompt section');
  assert.ok(/No X scraping occurred/i.test(out), 'no scrape disclaimer');
  assert.ok(/No x402 payment occurred/i.test(out), 'no payment disclaimer');
  assert.ok(out.includes('DryRunProduct'), 'product name in output');
  assert.ok(/https:\/\/x\.com\/search/i.test(out), 'search URL present');
});

test('version is 2.4+', () => {
  const parts = Agent.version.split('.').map(Number);
  assert.ok(parts[0] > 2 || (parts[0] === 2 && parts[1] >= 4), Agent.version);
});

test('dispatchToolCall plan_from_intent', () => {
  const r = Agent.dispatchToolCall('hyperxosist_plan_from_intent', {
    intent: 'Find product feedback about Acme for PR specs'
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.tool, 'hyperxosist_plan_from_intent');
  assert.ok(r.result && r.result.missionId);
  assert.ok(r.result.primaryStep);
});

test('dispatchToolCall accepts OpenAI-shaped call object', () => {
  const r = Agent.dispatchToolCall({
    function: {
      name: 'hyperxosist_list_missions',
      arguments: '{}'
    }
  });
  assert.strictEqual(r.ok, true);
  assert.ok(r.result);
});

test('dispatchToolCall accepts Anthropic-shaped call object', () => {
  const r = Agent.dispatchToolCall({
    name: 'hyperxosist_filter_keep_signals',
    input: {
      feedback: [
        'Acme crashes when exporting CSV on Safari',
        'love this so much game changer'
      ]
    }
  });
  assert.strictEqual(r.ok, true);
  assert.ok(r.result.keepCount >= 1);
  assert.ok(r.result.discardCount >= 1);
});

test('dispatchToolCall unknown tool returns error without throw', () => {
  const r = Agent.dispatchToolCall('hyperxosist_does_not_exist', {});
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, 'unknown_tool');
  assert.ok(Array.isArray(r.available));
});

test('runTool is alias of dispatchToolCall', () => {
  const a = Agent.runTool('hyperxosist_export_noise', {});
  assert.strictEqual(a.ok, true);
  assert.ok(a.result.rules);
});

test('toOpenAITools and toAnthropicTools shapes', () => {
  const oai = Agent.toOpenAITools();
  assert.ok(Array.isArray(oai));
  assert.ok(oai[0].type === 'function');
  assert.ok(oai[0].function.name.startsWith('hyperxosist_'));
  assert.ok(oai[0].function.parameters);

  const ant = Agent.toAnthropicTools();
  assert.ok(Array.isArray(ant));
  assert.ok(ant[0].name.startsWith('hyperxosist_'));
  assert.ok(ant[0].input_schema);
  assert.ok(!ant[0].function);
});

test('Responses tools preserve schemas, options and dispatch contract', () => {
  for (const options of [{}, { includeGrok: true }]) {
    const responses = Agent.toOpenAIResponsesTools(options);
    const chat = Agent.toOpenAITools(options);
    assert.strictEqual(responses.length, chat.length);
    responses.forEach((tool, i) => {
      assert.strictEqual(tool.type, 'function');
      assert.strictEqual(tool.name, chat[i].function.name);
      assert.deepStrictEqual(tool.parameters, chat[i].function.parameters);
      assert.strictEqual(tool.strict, false);
      assert.ok(!('function' in tool));
    });
  }
  const out = Agent.dispatchToolCall({ type: 'function_call', call_id: 'offline',
    name: 'hyperxosist_plan_from_intent', arguments: JSON.stringify({ intent: 'Find product feedback about Acme' }) });
  assert.strictEqual(out.ok, true);
});

test('CLI exposes Responses tool schema without API access', () => {
  const cp = require('child_process');
  const result = cp.spawnSync(process.execPath, [path.join(__dirname, '../bin/hyperxosist.js'),
    'tools', '--format', 'responses', '--json'], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.strictEqual(payload.format, 'openai.responses.tools.v1');
  assert.deepStrictEqual(payload.tools, Agent.toOpenAIResponsesTools());
});

test('getToolDefinitions format anthropic', () => {
  const t = Agent.getToolDefinitions({ format: 'anthropic' });
  assert.strictEqual(t.format, 'anthropic.tools.v1');
  assert.ok(t.tools[0].name);
  assert.ok(t.tools[0].input_schema);
});

test('exportKeepOnlyJson produces keep texts and optional S2F input', () => {
  const exp = Agent.exportKeepOnlyJson(
    [
      'Acme crashes every time I paste 20 lines of feedback on iOS.',
      'Love this idea, super useful.',
      'GM giveaway airdrop 100x'
    ],
    { productName: 'Acme', targetArea: 'export' }
  );
  assert.strictEqual(exp.type, 'hyperxosist.keep_only.v1');
  assert.ok(exp.keepCount >= 1);
  assert.ok(Array.isArray(exp.texts));
  assert.ok(exp.signalToFixInput);
  assert.strictEqual(exp.signalToFixInput.productName, 'Acme');
  assert.ok(exp.signalToFixInput.feedback.length === exp.keepCount);
  assert.ok(exp.agentPrompt);
  assert.ok(exp.markdown && exp.markdown.includes('Keep-only'));
});

test('dispatch export_keep_only tool', () => {
  const r = Agent.dispatchToolCall('hyperxosist_export_keep_only', {
    feedback: ['Please add JSON export for kept issues only'],
    productName: 'Acme'
  });
  assert.strictEqual(r.ok, true);
  assert.ok(r.result.keepCount >= 1);
});

test('CLI plan --json and dispatch work offline', () => {
  const { spawnSync } = require('child_process');
  const path = require('path');
  const cli = path.join(__dirname, '..', 'bin', 'hyperxosist.js');

  const plan = spawnSync(
    process.execPath,
    [cli, 'plan', 'Find product feedback about CliProduct', '--json', '--no-pretty'],
    { encoding: 'utf8', timeout: 15000 }
  );
  assert.strictEqual(plan.status, 0, plan.stderr || plan.stdout);
  const planJson = JSON.parse(plan.stdout);
  assert.ok(planJson.missionId);
  assert.ok(planJson.primaryStep);

  const disp = spawnSync(
    process.execPath,
    [
      cli,
      'dispatch',
      'hyperxosist_plan_from_intent',
      '--args',
      JSON.stringify({ intent: 'Find feedback about CliProduct' }),
      '--json',
      '--no-pretty'
    ],
    { encoding: 'utf8', timeout: 15000 }
  );
  assert.strictEqual(disp.status, 0, disp.stderr || disp.stdout);
  const dispJson = JSON.parse(disp.stdout);
  assert.strictEqual(dispJson.ok, true);

  const tools = spawnSync(
    process.execPath,
    [cli, 'tools', '--format', 'anthropic', '--json', '--no-pretty'],
    { encoding: 'utf8', timeout: 15000 }
  );
  assert.strictEqual(tools.status, 0, tools.stderr || tools.stdout);
  const toolsJson = JSON.parse(tools.stdout);
  assert.ok(toolsJson.tools[0].name);
  assert.ok(toolsJson.tools[0].input_schema);
});

test('noise high keeps documented cumulative terms', () => {
  const high = Agent.getActiveNoiseTerms({ enabled: true, preset: 'high' });
  [
    'giveaway', 'big if true', 'ブクマ推奨', 'gm', 'wagmi', 'alpha', '100x',
    'promo', 'presale', 'whitelist', '固定ポスト', '完全攻略', 'フォローで', 'リポストで'
  ].forEach((term) => assert.ok(high.includes(term), `high should include ${term}`));
});
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
