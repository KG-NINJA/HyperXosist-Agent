import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { artifactRequest, canonicalDigest, canonicalJson, createAVUBuyer, requestDigest, sha256, validatePrecheck, AVU_ORIGIN } from '../avu-buyer.mjs';

const recordedInput = JSON.parse(readFileSync(new URL('./fixtures/avu/precheck-input.json', import.meta.url)));
const require = createRequire(import.meta.url);
const recordedResponse = JSON.parse(readFileSync(new URL('./fixtures/avu/precheck-response.json', import.meta.url)));
const NOW = Date.parse('2026-09-06T12:00:00.000Z');
const url = `${AVU_ORIGIN}/verify-evidence`;
const policy = recordedInput.spend_policy;
const jsonText = '{"artifact_id":"test-handoff","status":"ready"}';
const options = () => ({ jsonText, expectedSha256: sha256(jsonText), clientRequestId: 'buyer-unit-001',
  idempotencyKey: 'buyer-unit-idempotency-001', requiresSignedReceipt: true, allowEvidenceUpload: true, spendPolicy: structuredClone(policy) });
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64');
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers });

// Synthetic quote/challenge/delivery fixtures follow public OpenAPI 0.4.3.
// Only the free-precheck fixture was obtained from production. No live purchase.
function service(overrides = {}) {
  const calls = []; let time = NOW; let input; let precheck; let binding; let accepted; let signedHeader;
  const keyPair = generateKeyPairSync('ed25519');
  const key = { ...keyPair.publicKey.export({ format: 'jwk' }), kid: `${AVU_ORIGIN}/agent.json#test-key` };
  const card = { fixture: 'canonical-mcp-card' };
  const encodeSigned = payload => ({ payload,
    signed_payload_b64url: Buffer.from(JSON.stringify(payload)).toString('base64url'),
    signature: { alg: 'Ed25519', kid: key.kid, value_b64url: sign(null, Buffer.from(JSON.stringify(payload)), keyPair.privateKey).toString('base64url') } });
  const fetchImpl = async (target, init) => {
    const path = new URL(target).pathname;
    calls.push({ path, init: structuredClone({ ...init, signal: undefined }) });
    assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit');
    if (overrides.fetch) {
      const result = overrides.fetch(path, init); if (result) return result;
    }
    if (path === '/health') return json({ status: overrides.unavailable ? 'degraded' : 'ok', service: 'agent-verification-utility', version: '0.4.3',
      checks: { deploy_enabled: true, runtime_enabled: true, payments_enabled: true, cost_basis_fresh: !overrides.unavailable },
      time: new Date(time - (overrides.staleHealth ? 300000 : 0)).toISOString() });
    if (path === '/agent.json') return json({ id: 'agent-verification-utility', version: '0.4.3', availability: overrides.unavailable ? 'degraded' : 'available',
      endpoints: { purchase: url, validate_request: `${AVU_ORIGIN}/validate-request` } });
    if (path === '/mcp/server-card') return json(overrides.badCard ? { wrong: true } : card);
    if (path === '/.well-known/jwks.json') return json({ keys: [key] });
    if (path === '/validate-request') {
      input = JSON.parse(init.body);
      precheck = structuredClone(recordedResponse);
      const r = precheck.precheck_receipt;
      r.spend_policy = input.spend_policy;
      r.request_check.request_hash = requestDigest(input.request);
      r.dropped_evidence.content_sha256 = sha256(Buffer.from(input.request.evidence.content_base64, 'base64'));
      r.dropped_evidence.decoded_bytes = Buffer.from(input.request.evidence.content_base64, 'base64').length;
      r.mcp_server_card.canonical_sha256 = canonicalDigest(card);
      delete r.receipt_digest; r.receipt_digest = canonicalDigest(r);
      overrides.precheck?.(precheck);
      return json(precheck);
    }
    if (path === '/quote') {
      assert.equal(init.headers['Idempotency-Key'], options().idempotencyKey);
      assert.deepEqual(JSON.parse(init.body), { ...input, precheck_receipt_digest: precheck.precheck_receipt.receipt_digest });
      binding = { schema_version: 'agent-economy/paid-verification-binding/1.0',
        binding_digest: sha256('test-binding'), precheck_receipt_digest: precheck.precheck_receipt.receipt_digest,
        request_hash: requestDigest(input.request), evidence_digest: sha256(Buffer.from(input.request.evidence.content_base64, 'base64')),
        policy_version: policy.policy_version, price_cap_atomic: input.spend_policy.max_amount_atomic,
        quoted_amount_atomic: '10000', network: policy.network, asset: policy.asset, pay_to: policy.pay_to,
        quote_id: 'qte_buyer_test', expires_at: new Date(time + 300000).toISOString(), discovery_survived: true,
        state: 'quoted', paid_receipt_id: null, refusal_reason: null };
      const quote = { quote_id: binding.quote_id, request_hash: binding.request_hash, price: { amount: '10000', asset: policy.asset, network: policy.network },
        purchase: { method: 'POST', url, quote_header: 'X-Quote-ID' }, paid_verification_binding: structuredClone(binding) };
      overrides.quote?.(quote); return json(quote);
    }
    if (path === '/verify-evidence') {
      assert.equal(init.body, calls.find(call => call.path === '/quote').init.body);
      assert.equal(init.headers['X-Quote-ID'], binding.quote_id);
      if (!init.headers['PAYMENT-SIGNATURE']) {
        binding.state = 'payment_required';
        accepted = { scheme: 'exact', network: policy.network, amount: '10000', asset: policy.asset, payTo: policy.pay_to,
          maxTimeoutSeconds: 300, extra: { name: 'USD Coin', version: '2', quote_id: binding.quote_id, binding_digest: binding.binding_digest } };
        const required = { x402Version: 2, error: 'payment required', resource: { url, description: 'test', mimeType: 'application/json' },
          accepts: [accepted], extensions: { test_extension: { preserved: true } } };
        const data = { ...required, paid_verification_binding: structuredClone(binding) };
        overrides.challenge?.(data, required);
        return json(data, 402, { 'PAYMENT-REQUIRED': b64(required) });
      }
      signedHeader = init.headers['PAYMENT-SIGNATURE'];
      if (overrides.failPaid) throw new Error('transport failed after submission');
      const checks = [{ index: 0, op: 'sha256_equals', passed: !overrides.assertionFail, code: overrides.assertionFail ? 'DIGEST_MISMATCH' : 'DIGEST_MATCH' }];
      const verification = { outcome: overrides.assertionFail ? 'fail' : 'pass', algorithm_version: 'det-json-v1', checks, executed_at: new Date(time).toISOString() };
      const receiptId = 'rcpt_buyer_test'; const evidenceId = 'evd_buyer_test'; const transactionId = 'txn_buyer_test';
      const tx = `0x${'a'.repeat(64)}`;
      const protectedPayload = { type: 'agent-verification-evidence/v1', evidence_id: evidenceId, transaction_id: transactionId,
        request_hash: binding.request_hash, input_digest: binding.evidence_digest, algorithm_version: 'det-json-v1', executor_version: '0.4.3',
        outcome: verification.outcome, checks_digest: canonicalDigest(checks), executed_at: verification.executed_at };
      const signed = encodeSigned(protectedPayload); delete signed.payload;
      const receiptPayload = { type: 'agent-verification-receipt/v1', schema_version: 1, receipt_id: receiptId,
        request: { task_type: 'verify_evidence', request_digest: binding.request_hash, evidence_digest: binding.evidence_digest,
          checks_requested: ['sha256_equals'], checks_performed: ['sha256_equals'], checks_unsupported: [] },
        verifier: { service_id: 'dev.kgninja.agent-economy/agent-verification-utility', service_version: '0.4.3', generation_id: 'agent-economy/offer-generation/0.4.3',
          algorithm_version: 'det-json-v1', policy_version: policy.policy_version },
        payment: { payment_protocol: 'x402-v2-exact', quote_id: binding.quote_id, network: policy.network, asset: policy.asset,
          amount_base_unit: '10000', verification_status: 'verified', settlement_status: 'confirmed',
          settlement_evidence_type: 'facilitator_response_with_transaction_hash', transaction_hash: tx },
        result: { decision: verification.outcome, result_digest: sha256('test-result'), evidence_id: evidenceId } };
      overrides.signedReceipt?.(receiptPayload);
      const delivery = { transaction_id: transactionId, quote_id: binding.quote_id, request_hash: binding.request_hash,
        verification, evidence: { evidence_id: evidenceId, ...signed },
        receipt: { receipt_id: receiptId, delivery: 'completed', price_paid_microusd: 10000,
          paid_verification_binding: { ...binding, state: 'delivered', paid_receipt_id: receiptId } },
        fulfillment_proof: { verification_receipt: encodeSigned(receiptPayload) } };
      overrides.delivery?.(delivery);
      const settle = { success: true, network: policy.network, transaction: tx };
      overrides.settlement?.(settle);
      return json(delivery, 200, overrides.missingSettlement ? {} : { 'PAYMENT-RESPONSE': b64(settle) });
    }
    throw new Error(`Unexpected path: ${path}`);
  };
  const buyer = createAVUBuyer({ fetchImpl, now: () => time });
  const wallet = async ({ paymentRequired }) => {
    const payload = { x402Version: 2, resource: paymentRequired.resource, accepted: paymentRequired.accepts[0], extensions: paymentRequired.extensions,
      payload: { signature: `0x${'b'.repeat(130)}`, authorization: { from: `0x${'1'.repeat(40)}`, to: policy.pay_to, value: '10000',
        validAfter: '0', validBefore: String(Math.floor(Date.parse(binding.expires_at) / 1000)), nonce: `0x${'c'.repeat(64)}` } } };
    overrides.wallet?.(payload); return b64(payload);
  };
  return { buyer, calls, wallet, setTime: value => { time = value; }, getSignedHeader: () => signedHeader };
}
async function ready(s) { const handle = await s.buyer.prepare(options()); assert.equal(handle.state, 'prepared'); await s.buyer.requestChallenge(handle); return handle; }
const count = (s, path) => s.calls.filter(call => call.path === path).length;
const rejects = (fn, code) => assert.rejects(fn, error => error.code === code);

test('real free-precheck fixture matches independently calculated request and receipt digests', () => {
  assert.equal(requestDigest(recordedInput.request), 'sha256:349e4bdc0abb16adbf0f5acc778c3c951fe4c1156a13fd8e6104d6d3292db01e');
  assert.equal(validatePrecheck(recordedResponse, recordedInput.request, policy).receipt_digest, recordedResponse.precheck_receipt.receipt_digest);
});
test('handoff and MCP expose optional discovery while remaining free and never claim a deployed buyer tool', async () => {
  const Agent = require('../agent-api.js');
  const args = { productName: 'Demo', feedback: ['Demo crashes every time I paste 20 lines of feedback on iOS.'] };
  const handoff = Agent.buildHandoffPackage(args);
  assert.equal(handoff.optionalArtifactReceipt.required, false);
  assert.equal(handoff.optionalArtifactReceipt.paymentAuthorized, false);
  assert.equal(handoff.optionalArtifactReceipt.available, 'check_live');
  const { createToolDispatcher } = require('../mcp/core.js');
  const output = await createToolDispatcher(Agent)('hyperxosist_build_handoff', args);
  assert.equal(output.structuredContent.accessTier, 'free');
  assert.equal(output.structuredContent.handoff.optionalArtifactReceipt.required, false);
  const metadata = JSON.parse(readFileSync(new URL('../avu-buyer.json', import.meta.url)));
  assert.equal(metadata.client.remote_mcp_tool_added, false);
  assert.equal(metadata.client.automatic_paid_retries, 0);
});
test('local-only need performs zero network or payment operations', async () => {
  const s = service(); assert.equal((await s.buyer.prepare({ ...options(), requiresSignedReceipt: false })).state, 'local_only');
  assert.equal(s.calls.length, 0);
});
test('artifact mismatch, excessive size and missing upload consent fail before network', async () => {
  const s = service();
  await rejects(() => s.buyer.prepare({ ...options(), expectedSha256: sha256('different') }), 'LOCAL_DIGEST_MISMATCH');
  await rejects(() => s.buyer.prepare({ ...options(), jsonText: 'x'.repeat(65537) }), 'INVALID_ARTIFACT_SIZE');
  await rejects(() => s.buyer.prepare({ ...options(), allowEvidenceUpload: false }), 'EVIDENCE_UPLOAD_NOT_AUTHORIZED');
  assert.equal(s.calls.length, 0);
});
test('unsupported policy, amounts and keys cannot become payment authority', async () => {
  for (const patch of [{ max_amount_atomic: 10000 }, { max_amount_atomic: '1e4' }, { max_amount_atomic: '-1' }, { network: 'eip155:1' }, { pay_to: `0x${'0'.repeat(40)}` }, { private_key: 'DO_NOT_SEND' }]) {
    const s = service(); await assert.rejects(() => s.buyer.prepare({ ...options(), spendPolicy: { ...policy, ...patch } })); assert.equal(s.calls.length, 0);
  }
});
test('degraded service creates no quote and uploads no artifact despite eligible precheck capability', async () => {
  const s = service({ unavailable: true }); const result = await s.buyer.prepare(options());
  assert.equal(result.state, 'blocked'); assert.ok(result.reasons.includes('COST_BASIS_STALE_OR_UNKNOWN'));
  assert.equal(count(s, '/validate-request'), 0); assert.equal(count(s, '/quote'), 0);
});
test('stale health cannot authorize progression', async () => {
  const s = service({ staleHealth: true }); assert.equal((await s.buyer.prepare(options())).state, 'blocked'); assert.equal(count(s, '/quote'), 0);
});
test('valid preparation is free and never creates a quote or calls wallet', async () => {
  const s = service(); const h = await s.buyer.prepare(options()); assert.equal(h.paymentAuthorized, false);
  assert.equal(count(s, '/quote'), 0); assert.equal(count(s, '/verify-evidence'), 0);
});
test('tampered precheck receipt is refused', async () => {
  const s = service({ precheck: p => { p.precheck_receipt.spend_policy.max_amount_atomic = '99999'; } });
  await rejects(() => s.buyer.prepare(options()), 'PRECHECK_DIGEST_MISMATCH');
});
test('valid digest on another request is still refused', async () => {
  const s = service({ precheck: p => { const r = p.precheck_receipt; r.request_check.request_hash = sha256('other'); delete r.receipt_digest; r.receipt_digest = canonicalDigest(r); } });
  await rejects(() => s.buyer.prepare(options()), 'PRECHECK_REQUEST_MISMATCH');
});
test('changed discovery card blocks purchase', async () => {
  const s = service({ badCard: true }); await rejects(() => s.buyer.prepare(options()), 'MCP_CARD_CHANGED'); assert.equal(count(s, '/quote'), 0);
});
test('foreign handles cannot be used to request or pay', async () => {
  const s = service(); await rejects(() => s.buyer.requestChallenge({ state: 'prepared' }), 'PREPARED_SESSION_REQUIRED');
  await rejects(() => s.buyer.pay({ state: 'awaiting_authorization' }, { authorizePayment: s.wallet }), 'CHALLENGE_REQUIRED');
});
test('quoted price above host cap is refused before requesting payment', async () => {
  const s = service({ quote: q => { q.paid_verification_binding.quoted_amount_atomic = '10001'; } });
  const h = await s.buyer.prepare(options()); await rejects(() => s.buyer.requestChallenge(h), 'PRICE_EXCEEDS_CAP'); assert.equal(count(s, '/verify-evidence'), 0);
});
test('expired quote is refused', async () => {
  const s = service({ quote: q => { q.paid_verification_binding.expires_at = new Date(NOW).toISOString(); } });
  const h = await s.buyer.prepare(options()); await rejects(() => s.buyer.requestChallenge(h), 'QUOTE_EXPIRED');
});
test('changed paid binding is refused', async () => {
  const s = service({ challenge: d => { d.paid_verification_binding.quote_id = 'qte_other'; } });
  const h = await s.buyer.prepare(options()); await rejects(() => s.buyer.requestChallenge(h), 'PAID_BINDING_CHANGED');
});
test('x402 response-body and header disagreement is refused', async () => {
  const s = service({ challenge: d => { d.accepts = [{ ...d.accepts[0], amount: '9000' }]; } });
  const h = await s.buyer.prepare(options()); await rejects(() => s.buyer.requestChallenge(h), 'CHALLENGE_HEADER_BODY_MISMATCH');
});
test('host must explicitly supply authorization and may decline', async () => {
  const s = service(); const h = await ready(s);
  await rejects(() => s.buyer.pay(h), 'HOST_AUTHORIZATION_REQUIRED');
  assert.equal((await s.buyer.pay(h, { authorizePayment: async () => null })).reason, 'AUTHORIZATION_DECLINED');
  assert.equal(s.getSignedHeader(), undefined);
});
test('quote expiring while wallet approval is pending never submits signed proof', async () => {
  const s = service(); const h = await ready(s);
  await rejects(() => s.buyer.pay(h, { authorizePayment: async args => { const p = await s.wallet(args); s.setTime(NOW + 400000); return p; } }), 'QUOTE_EXPIRED');
  assert.equal(s.getSignedHeader(), undefined);
});
test('wallet cannot change accepted payment terms or authorization recipient/value', async () => {
  for (const mutate of [p => { p.accepted.amount = '10001'; }, p => { p.payload.authorization.to = `0x${'2'.repeat(40)}`; }, p => { p.payload.authorization.value = '10001'; }]) {
    const s = service({ wallet: mutate }); const h = await ready(s); await assert.rejects(() => s.buyer.pay(h, { authorizePayment: s.wallet })); assert.equal(s.getSignedHeader(), undefined);
  }
});
test('single authorized payment preserves exact body and verifies evidence plus receipt signatures', async () => {
  const s = service(); const h = await ready(s); const result = await s.buyer.pay(h, { authorizePayment: s.wallet });
  assert.equal(result.state, 'delivered'); assert.equal(result.outcome, 'pass'); assert.equal(result.receipt, 'signature_verified');
  assert.equal(result.independentOnchainVerification, false); assert.equal(result.realWorldTruthVerified, false);
  assert.equal(count(s, '/verify-evidence'), 2);
  assert.ok(result.rawResponse); assert.ok(result.paymentResponse);
  assert.ok(!JSON.stringify(s.buyer.events()).includes(s.getSignedHeader()));
  assert.ok(!JSON.stringify(s.buyer.events()).includes('test-handoff'));
  await rejects(() => s.buyer.pay(h, { authorizePayment: s.wallet }), 'CHALLENGE_REQUIRED');
});
test('a paid fail outcome is delivered, not a reason to pay again', async () => {
  const s = service({ assertionFail: true }); const h = await ready(s); const result = await s.buyer.pay(h, { authorizePayment: s.wallet });
  assert.equal(result.state, 'delivered'); assert.equal(result.outcome, 'fail');
});
test('concurrent pay calls authorize and submit at most once', async () => {
  const s = service(); const h = await ready(s); let signs = 0;
  const authorizePayment = async args => { signs++; return s.wallet(args); };
  const result = await Promise.allSettled([s.buyer.pay(h, { authorizePayment }), s.buyer.pay(h, { authorizePayment })]);
  assert.equal(signs, 1); assert.equal(result.filter(r => r.status === 'fulfilled').length, 1); assert.equal(count(s, '/verify-evidence'), 2);
});
test('transport loss after submission is unknown and does not retry', async () => {
  const s = service({ failPaid: true }); const h = await ready(s); const result = await s.buyer.pay(h, { authorizePayment: s.wallet });
  assert.equal(result.state, 'unknown'); assert.equal(result.reason, 'NETWORK_ERROR');
  await rejects(() => s.buyer.pay(h, { authorizePayment: s.wallet }), 'CHALLENGE_REQUIRED'); assert.equal(count(s, '/verify-evidence'), 2);
});
test('invalid signatures, altered checks, changed signed payment and missing settlement never count as delivered', async () => {
  for (const o of [
    { delivery: d => { d.evidence.signature.value_b64url = Buffer.alloc(64).toString('base64url'); } },
    { delivery: d => { d.verification.checks[0].code = 'ALTERED'; } },
    { signedReceipt: r => { r.payment.amount_base_unit = '9999'; } },
    { signedReceipt: r => { r.verifier.service_id = 'another-service'; } },
    { missingSettlement: true }, { settlement: r => { r.success = false; } },
    { settlement: r => { r.transaction = `0x${'b'.repeat(64)}`; } }
  ]) {
    const s = service(o); const h = await ready(s); const result = await s.buyer.pay(h, { authorizePayment: s.wallet });
    assert.equal(result.state, 'unknown'); assert.ok(result.evidenceToReview.rawResponse); assert.equal(count(s, '/verify-evidence'), 2);
  }
});
test('authorizer errors cannot leak secret exception text into telemetry', async () => {
  const s = service(); const h = await ready(s);
  await rejects(() => s.buyer.pay(h, { authorizePayment: async () => { throw Object.assign(new Error('private-key-value'), { code: 'secret-token-value' }); } }), 'INVALID_RESPONSE');
  assert.ok(!JSON.stringify(s.buyer.events()).includes('secret')); assert.equal(s.getSignedHeader(), undefined);
});
test('redirected, oversized and invalid JSON responses are refused', async () => {
  for (const fake of [
    () => Object.defineProperty(json({}), 'redirected', { value: true }),
    () => json({}, 200, { 'content-length': '999999' }),
    () => new Response('x'.repeat(262145)),
    () => new Response('not json')
  ]) {
    const s = service({ fetch: () => fake() }); await assert.rejects(() => s.buyer.prepare(options())); assert.equal(count(s, '/quote'), 0);
  }
});
test('canonicalization rejects unsupported values, sorts numeric-looking keys lexically and preserves exact artifact bytes', () => {
  assert.equal(canonicalJson({ '2': 'b', '10': 'a' }), '{"10":"a","2":"b"}');
  for (const value of [undefined, NaN, Infinity, BigInt(1), new Date(), [undefined], '\ud800']) assert.throws(() => canonicalJson(value));
  const spaced = '{ "unicode": "柴犬" }\n';
  const r = artifactRequest({ jsonText: spaced, expectedSha256: sha256(spaced), clientRequestId: 'unicode-001' });
  assert.equal(Buffer.from(r.evidence.content_base64, 'base64').toString(), spaced);
});
