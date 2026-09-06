import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createAgentMatchmaker, listAgentOffers, usdcAtomic, API_ORIGIN, BAZAAR_SEARCH, NETWORK, USDC, SELLER_ADDRESS } from '../agent-matchmaker.mjs';
import { AVU_ORIGIN, AVU_POLICY_VERSION, canonicalDigest, requestDigest, sha256 } from '../avu-buyer.mjs';
import { MARKETPLACE_TOOLS, createMarketplaceDispatcher } from '../mcp/matchmaker-server.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/matchmaking/production-discovery.json', import.meta.url)));
const precheck = JSON.parse(readFileSync(new URL('./fixtures/avu/precheck-response.json', import.meta.url)));
const NOW = Date.parse('2026-09-06T12:00:00Z');
const body = '{"artifact":"synthetic-fixture","state":"ready"}';
const policy = { policy_version: AVU_POLICY_VERSION, max_amount_atomic: '10000', network: NETWORK, asset: USDC, pay_to: SELLER_ADDRESS };
const request = (extra = {}) => ({ requestId: 'synthetic-demand-001', intent: 'x-search', maxPriceUsdc: '0.01',
  expiresAt: new Date(NOW + 300000).toISOString(), localSolutionSufficient: false, ...extra });
const receiptRequest = (extra = {}) => request({ intent: 'artifact-receipt',
  artifact: { sha256: sha256(body), mediaType: 'application/json', byteLength: Buffer.byteLength(body) }, ...extra });
const prepareOptions = (extra = {}) => ({ jsonText: body, expectedSha256: sha256(body), allowEvidenceUpload: true,
  spendPolicy: structuredClone(policy), idempotencyKey: 'synthetic-marketplace-001', ...extra });
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers });
const rejects = (fn, code) => assert.rejects(fn, error => error.code === code);

function harness(options = {}) {
  let clock = NOW; const calls = [];
  const card = { fixture: 'synthetic-marketplace-mcp-card' };
  const key = generateKeyPairSync('ed25519').publicKey.export({ format: 'jwk' });
  const fetchImpl = async (url, init) => {
    calls.push({ url, init: { ...init, signal: undefined } });
    assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit');
    assert.equal(init.headers.Authorization, undefined); assert.equal(init.headers['PAYMENT-SIGNATURE'], undefined);
    const overridden = options.fetch?.(url, init); if (overridden) return overridden;
    if (url === `${API_ORIGIN}/match`) {
      const sent = JSON.parse(init.body);
      assert.deepEqual(Object.keys(sent).sort(), ['intent', 'local_solution_sufficient', 'max_price_usdc', 'network', 'prefer_free']);
      const result = structuredClone(fixture.match);
      result.matches = [structuredClone(fixture.catalog.offers.find(o => o.intent === sent.intent))];
      options.match?.(result); return json(result);
    }
    if (url === `${API_ORIGIN}/openapi.json`) { const api = structuredClone(fixture.openapi); options.openapi?.(api); return json(api); }
    if (url === `${AVU_ORIGIN}/health`) return json({ status: options.degraded ? 'degraded' : 'ok', version: '0.4.3', service: 'agent-verification-utility',
      time: new Date(clock - (options.stale ? 180000 : 0)).toISOString(),
      checks: { deploy_enabled: true, runtime_enabled: true, payments_enabled: true, cost_basis_fresh: !options.degraded } });
    if (url === `${AVU_ORIGIN}/agent.json`) {
      const value = { id: 'agent-verification-utility', version: '0.4.3', availability: options.degraded ? 'degraded' : 'available',
        endpoints: { purchase: `${AVU_ORIGIN}/verify-evidence`, validate_request: `${AVU_ORIGIN}/validate-request` },
        payment: { amount: '10000', network: NETWORK, asset: USDC, symbol: 'USDC', decimals: 6 } };
      options.manifest?.(value); return json(value);
    }
    if (url === `${AVU_ORIGIN}/validate-request`) {
      const sent = JSON.parse(init.body); const result = structuredClone(precheck); const r = result.precheck_receipt;
      r.spend_policy = sent.spend_policy;
      r.request_check.request_hash = requestDigest(sent.request);
      r.dropped_evidence.content_sha256 = sha256(Buffer.from(sent.request.evidence.content_base64, 'base64'));
      r.dropped_evidence.decoded_bytes = Buffer.from(sent.request.evidence.content_base64, 'base64').length;
      r.mcp_server_card.canonical_sha256 = canonicalDigest(card);
      delete r.receipt_digest; r.receipt_digest = canonicalDigest(r);
      return json(result);
    }
    if (url === `${AVU_ORIGIN}/mcp/server-card`) return json(card);
    if (url === `${AVU_ORIGIN}/.well-known/jwks.json`) return json({ keys: [{ ...key, kid: 'synthetic-key' }] });
    throw new Error('Unexpected network request (including any paid route)');
  };
  const matcher = createAgentMatchmaker({ fetchImpl, now: () => clock, ...options.host });
  return { matcher, calls, setTime: value => { clock = value; } };
}

test('USDC budget conversion is exact, including sub-cent and maximum amounts', () => {
  assert.equal(usdcAtomic('0.000001'), '1'); assert.equal(usdcAtomic('0.010000'), '10000');
  assert.equal(usdcAtomic('999999999.999999'), '999999999999999');
  for (const bad of [0.01, '1e-2', '-1', 'NaN', 'Infinity', '0.0000001', '01', ' 1', '1000000000']) {
    assert.throws(() => usdcAtomic(bad), /INVALID_BUDGET/);
  }
});
test('the directory accurately exposes six capabilities from one seller operator', () => {
  const directory = listAgentOffers();
  assert.equal(directory.independentSellerCount, 1); assert.equal(directory.offers.length, 6);
  assert.equal(directory.paymentAuthorized, false);
  assert.ok(directory.offers.every(o => o.availability === 'check_live' && o.limitation && o.freeAlternative));
});
test('five real catalog contracts match without visiting paid endpoints or sending task content', async () => {
  for (const offer of fixture.catalog.offers) {
    const h = harness(); const result = await h.matcher.match(request({ intent: offer.intent }));
    assert.equal(result.decision, 'review', JSON.stringify(result));
    assert.equal(result.candidates[0].resource, offer.endpoint);
    assert.equal(result.candidates[0].amountAtomic, '10000');
    assert.equal(result.candidates[0].readiness, 'discovery_consistent_execution_unverified');
    assert.equal(result.candidates[0].next.inputSchema.type, 'object');
    assert.equal(result.purchaseExecuted, false); assert.equal(result.paymentAuthorized, false); assert.equal(result.revenueClaimed, false);
    assert.equal(h.calls.length, 2);
    assert.equal(h.calls.find(c => c.url.endsWith('/match')).init.method, 'POST');
    assert.ok(h.calls.every(c => !c.url.endsWith(offer.endpoint.slice(API_ORIGIN.length))));
    assert.equal(result.buyerIdentity, 'buyer_operator_unknown');
  }
});
test('free, unsupported, zero-budget and expired demands do not contact a seller', async () => {
  for (const [extra, reason] of [
    [{ localSolutionSufficient: true }, 'LOCAL_SOLUTION_SUFFICIENT'],
    [{ requiredCapabilities: ['collect_x_posts'] }, 'REQUIRED_CAPABILITY_UNSUPPORTED'],
    [{ maxPriceUsdc: '0' }, 'ZERO_PAID_BUDGET'],
    [{ expiresAt: new Date(NOW - 1).toISOString() }, 'DEMAND_EXPIRED']
  ]) {
    const h = harness(); const out = await h.matcher.match(request(extra));
    assert.deepEqual(out.reasons, [reason]); assert.equal(out.candidates.length, 0); assert.equal(h.calls.length, 0);
  }
});
test('unsupported requirements cannot be mapped onto the wrong paid product', async () => {
  for (const [intent, capability] of [['url-summary', 'ai_written_summary'], ['shell-safety', 'sandbox_execution'],
    ['service-visibility', 'audit_arbitrary_website'], ['artifact-receipt', 'independent_truth_verification']]) {
    const h = harness(); const input = intent === 'artifact-receipt' ? receiptRequest() : request({ intent });
    assert.equal((await h.matcher.match({ ...input, requiredCapabilities: [capability] })).decision, 'skip');
    assert.equal(h.calls.length, 0);
  }
});
test('host-owned operator and recipient checks exclude circular own-service purchases', async () => {
  for (const host of [{ buyerOperatorId: 'KG-NINJA' }, { buyerAddress: SELLER_ADDRESS.toLowerCase() }]) {
    const h = harness({ host }); const out = await h.matcher.match(request());
    assert.deepEqual(out.reasons, ['SAME_OPERATOR_OR_RECIPIENT']); assert.equal(h.calls.length, 0);
  }
  const h = harness();
  await rejects(() => h.matcher.match(request({ buyerOperatorId: 'external' })), 'INVALID_DEMAND');
});
test('client enforces the budget even when seller matching ignores it', async () => {
  const h = harness(); const out = await h.matcher.match(request({ maxPriceUsdc: '0.009999' }));
  assert.deepEqual(out.reasons, ['NO_OFFER_WITHIN_BUDGET']); assert.equal(out.candidates.length, 0);
});
test('price, endpoint, capability and recipient tampering blocks matching', async () => {
  for (const mutate of [
    o => { o.endpoint = 'https://attacker.example/pay'; }, o => { o.intent = 'command-error'; },
    o => { o.price.atomic_amount = '1'; }, o => { o.price.network = 'eip155:84532'; },
    o => { o.price.mode = 'testnet'; }, o => { o.payment.recipient = `0x${'1'.repeat(40)}`; },
    o => { o.payment.authorization_required = false; }
  ]) {
    const h = harness({ match: r => mutate(r.matches[0]) });
    assert.equal((await h.matcher.match(request())).decision, 'blocked');
    assert.equal(h.calls.length, 2);
  }
});
test('OpenAPI terms and request schema must agree with a match', async () => {
  for (const mutate of [
    op => { op['x-payment-info'].price = '$0.02'; },
    op => { op['x-payment-info'].payTo = `0x${'2'.repeat(40)}`; },
    op => { op['x-payment-info'].bazaar_indexing.asset_contract = `0x${'3'.repeat(40)}`; },
    op => { delete op.requestBody; }
  ]) {
    const h = harness({ openapi: v => mutate(v.paths['/hyperxosist-query'].post) });
    assert.equal((await h.matcher.match(request())).decision, 'blocked');
  }
});
test('seller cannot claim a purchase during discovery or contradict a skip', async () => {
  for (const mutate of [r => { r.purchase_executed = true; }, r => { r.payment_authorized = true; },
    r => { r.decision = 'skip'; }, r => { r.matches.push(structuredClone(r.matches[0])); }]) {
    const h = harness({ match: mutate }); assert.equal((await h.matcher.match(request())).decision, 'blocked');
  }
});
test('same demand is deduplicated in flight and returned objects cannot mutate a match', async () => {
  const h = harness(); const [a, b] = await Promise.all([h.matcher.match(request()), h.matcher.match(request())]);
  assert.deepEqual(a, b); assert.equal(h.calls.length, 2);
  a.candidates[0].amountAtomic = '1';
  assert.equal((await h.matcher.match(request())).candidates[0].amountAtomic, '10000');
  await rejects(() => h.matcher.match(request({ maxPriceUsdc: '0.02' })), 'REQUEST_ID_REUSED_WITH_DIFFERENT_DEMAND');
  assert.equal(h.matcher.diagnostics().demands, 1);
});
test('matches refresh after sixty seconds; expired demand never keeps a cached offer', async () => {
  const h = harness(); const first = await h.matcher.match(request());
  h.setTime(NOW + 61000); const second = await h.matcher.match(request());
  assert.notEqual(first.matchId, second.matchId); assert.equal(h.calls.length, 4);
  h.setTime(NOW + 300001);
  assert.deepEqual((await h.matcher.match(request())).reasons, ['DEMAND_EXPIRED']); assert.equal(h.calls.length, 4);
});
test('demand expiry is checked after asynchronous discovery', async () => {
  const h = harness({ match: () => h.setTime(NOW + 400000) });
  assert.deepEqual((await h.matcher.match(request())).reasons, ['DEMAND_EXPIRED']);
});
test('model input cannot add arbitrary URLs, payment authority or artifact content', async () => {
  const h = harness();
  for (const extra of [{ url: 'http://127.0.0.1' }, { paymentSignature: 'secret' }, { allowBazaar: true }, { need: 'confidential logs' }]) {
    await rejects(() => h.matcher.match(request(extra)), 'INVALID_DEMAND');
  }
  await rejects(() => h.matcher.match(receiptRequest({ artifact: { content: body } })), 'INVALID_ARTIFACT_DESCRIPTOR');
  await rejects(() => h.matcher.match(request({ intent: ['x-search'] })), 'UNSUPPORTED_INTENT');
  await rejects(() => h.matcher.match(receiptRequest({ artifact: { ...receiptRequest().artifact, sha256: [sha256(body)] } })), 'INVALID_ARTIFACT_DESCRIPTOR');
  assert.equal(h.calls.length, 0);
});
test('network errors, redirects, oversized and non-JSON results fail closed without leaking error text', async () => {
  for (const value of [
    () => { throw new Error('SECRET in an upstream error'); },
    () => json({}, 302), () => json({}, 402),
    () => json({}, 200, { 'content-length': '9999999' }),
    () => new Response('not JSON'),
    () => new Response('x'.repeat(524289))
  ]) {
    const h = harness({ fetch: value }); const out = await h.matcher.match(request());
    assert.equal(out.decision, 'blocked'); assert.doesNotMatch(JSON.stringify(out), /SECRET/);
  }
});
test('unavailable or stale AVU cannot become a payable candidate', async () => {
  for (const options of [{ degraded: true }, { stale: true }]) {
    const h = harness(options); const out = await h.matcher.match(receiptRequest());
    assert.equal(out.decision, 'blocked'); assert.equal(h.calls.length, 2);
    assert.ok(h.calls.every(c => c.init.method === 'GET'));
  }
});
test('AVU price and rail are checked after readiness', async () => {
  for (const mutate of [v => { v.payment.asset = `0x${'1'.repeat(40)}`; }, v => { v.payment.amount = 'NaN'; }]) {
    const h = harness({ manifest: mutate }); assert.equal((await h.matcher.match(receiptRequest())).decision, 'blocked');
  }
  const h = harness(); assert.equal((await h.matcher.match(receiptRequest({ maxPriceUsdc: '0.001' }))).decision, 'skip');
});
test('receipt preparation binds the matched artifact, budget and explicit upload consent', async () => {
  const h = harness(); const matched = await h.matcher.match(receiptRequest());
  assert.equal(matched.decision, 'review');
  await rejects(() => h.matcher.prepareReceipt('invented', prepareOptions()), 'FRESH_RECEIPT_MATCH_REQUIRED');
  await rejects(() => h.matcher.prepareReceipt(matched.matchId, prepareOptions({ expectedSha256: sha256('different') })), 'MATCH_ARTIFACT_MISMATCH');
  await rejects(() => h.matcher.prepareReceipt(matched.matchId, prepareOptions({ spendPolicy: { ...policy, max_amount_atomic: '20000' } })), 'HOST_SPEND_POLICY_MISMATCH');
  await rejects(() => h.matcher.prepareReceipt(matched.matchId, prepareOptions({ allowEvidenceUpload: false })), 'EVIDENCE_UPLOAD_NOT_AUTHORIZED');
  assert.equal(h.calls.length, 2);
});
test('matching connects to the real buyer module free precheck with no quote, wallet or payment call', async () => {
  const h = harness(); const matched = await h.matcher.match(receiptRequest());
  const pending = h.matcher.prepareReceipt(matched.matchId, prepareOptions());
  await rejects(() => h.matcher.prepareReceipt(matched.matchId, prepareOptions()), 'RECEIPT_PREPARATION_ALREADY_STARTED');
  const prepared = await pending;
  assert.equal(prepared.state, 'prepared'); assert.equal(prepared.handle.state, 'prepared');
  assert.equal(prepared.paymentAuthorized, false); assert.equal(prepared.quoteCreated, false);
  assert.equal(typeof prepared.buyer.requestChallenge, 'function');
  assert.equal(h.calls.filter(c => c.url.endsWith('/validate-request')).length, 1);
  assert.ok(h.calls.every(c => !c.url.endsWith('/quote') && !c.url.endsWith('/verify-evidence')));
  await rejects(() => h.matcher.prepareReceipt(matched.matchId, prepareOptions()), 'RECEIPT_PREPARATION_ALREADY_STARTED');
});
test('expired receipt match requires rematching before an upload', async () => {
  const h = harness(); const matched = await h.matcher.match(receiptRequest()); h.setTime(NOW + 61000);
  await rejects(() => h.matcher.prepareReceipt(matched.matchId, prepareOptions()), 'FRESH_RECEIPT_MATCH_REQUIRED');
  assert.equal(h.calls.length, 2);
});
test('Bazaar lookup requires host opt-in, sends no credentials and never visits discovered sellers', async () => {
  const h = harness(); await rejects(() => h.matcher.discover({ query: 'weather', maxPriceUsdc: '0.01' }), 'EXTERNAL_DISCOVERY_NOT_ENABLED_BY_HOST');
  assert.equal(h.calls.length, 0);
  const resource = { resource: 'https://weather.example/forecast', type: 'http', x402Version: 2,
    accepts: [{ scheme: 'exact', network: NETWORK, asset: USDC, amount: '1000', payTo: `0x${'1'.repeat(40)}` }] };
  const publicLookup = harness({ host: { allowBazaar: true }, fetch: (url, init) => {
    const u = new URL(url); assert.equal(`${u.origin}${u.pathname}`, BAZAAR_SEARCH); assert.equal(init.method, 'GET');
    assert.equal(u.searchParams.get('asset'), USDC); assert.equal(u.searchParams.get('maxUsdPrice'), '0.01');
    return json({ x402Version: 2, resources: [resource, { ...resource, resource: 'http://127.0.0.1/private' },
      { ...resource, resource: 'https://localhost/private' }, { ...resource, accepts: [{ ...resource.accepts[0], amount: '20000' }] }], partialResults: true });
  } });
  const result = await publicLookup.matcher.discover({ query: 'public weather', maxPriceUsdc: '0.01' });
  assert.equal(result.candidates.length, 1); assert.equal(result.partialResults, true);
  assert.equal(result.candidates[0].automaticPurchaseEligible, false); assert.equal(publicLookup.calls.length, 1);
});
test('Bazaar outage is unknown availability, not a fabricated zero-demand result', async () => {
  const h = harness({ host: { allowBazaar: true }, fetch: () => json({}, 502) });
  const result = await h.matcher.discover({ query: 'public weather', maxPriceUsdc: '0.01' });
  assert.equal(result.state, 'unavailable'); assert.equal(result.reason, 'DISCOVERY_UNAVAILABLE');
});
test('MCP exposes matching and discovery with no payment or policy-changing tool', async () => {
  assert.deepEqual(MARKETPLACE_TOOLS.map(t => t.name), ['list_agent_offers', 'match_agent_service', 'discover_agent_services']);
  assert.ok(MARKETPLACE_TOOLS.every(t => t.annotations.readOnlyHint && !t.annotations.destructiveHint && t.inputSchema.additionalProperties === false));
  const h = harness(); const dispatch = createMarketplaceDispatcher(h.matcher);
  assert.equal((await dispatch('pay', {})).isError, true);
  assert.equal((await dispatch('list_agent_offers', { authorize: true })).isError, true);
  const result = await dispatch('match_agent_service', request());
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  assert.equal(result.structuredContent.decision, 'review');
});
test('existing handoff and agent manifest identify the local matching entry without inventing deployed tools', () => {
  const require = createRequire(import.meta.url);
  const Agent = require('../agent-api.js');
  const handoff = Agent.buildHandoffPackage({ productName: 'Demo', feedback: ['Demo crashes when I paste 20 lines in Safari.'] });
  assert.equal(handoff.optionalArtifactReceipt.matchmaking.localMcpTool, 'match_agent_service');
  assert.equal(handoff.optionalArtifactReceipt.matchmaking.availability, 'local_source_only');
  assert.equal(handoff.optionalArtifactReceipt.paymentAuthorized, false);
  const manifest = require('../agent-marketplace.json');
  assert.deepEqual(manifest.mcp.tools, MARKETPLACE_TOOLS.map(t => t.name));
  assert.equal(manifest.mcp.production_remote_tools_changed, false);
  assert.deepEqual(manifest.mcp.payment_tools, []);
});
test('a real stdio MCP client lists and calls the installed matching server without network or payment', async () => {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [fileURLToPath(new URL('../mcp/matchmaker-server.mjs', import.meta.url))], stderr: 'pipe' });
  const client = new Client({ name: 'matchmaker-integration-test', version: '1.0.0' });
  await client.connect(transport);
  try {
    assert.deepEqual((await client.listTools()).tools.map(t => t.name), MARKETPLACE_TOOLS.map(t => t.name));
    const result = await client.callTool({ name: 'match_agent_service', arguments: request({ localSolutionSufficient: true,
      expiresAt: new Date(Date.now() + 300000).toISOString() }) });
    assert.equal(result.structuredContent.decision, 'skip'); assert.equal(result.structuredContent.paymentAuthorized, false);
  } finally { await client.close(); }
});
