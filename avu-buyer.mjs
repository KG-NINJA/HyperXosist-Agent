import { createHash, createPublicKey, verify } from 'node:crypto';

// A buyer-owned opt-in adapter. Never install an auto-paying fetch wrapper here.
export const AVU_ORIGIN = 'https://agent-economy.kgninja.dev';
export const AVU_POLICY_VERSION = 'agent-economy/precheck-policy/2.0';
const PURCHASE_URL = `${AVU_ORIGIN}/verify-evidence`;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const ATOMIC = /^[1-9][0-9]{0,15}$/;
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const MAX_RESPONSE_BYTES = 262144;
const clone = value => structuredClone(value);

export class AVUBuyerError extends Error {
  constructor(code) { super(code); this.name = 'AVUBuyerError'; this.code = code; }
}
function requireThat(value, code) { if (!value) throw new AVUBuyerError(code); }

// RFC 8785 for JSON values: ECMAScript number encoding and UTF-16 key order.
// Reject non-JSON values instead of silently dropping them from signed data.
export function canonicalJson(value, depth = 0) {
  requireThat(depth <= 40, 'JSON_TOO_DEEP');
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') {
    requireThat(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value), 'INVALID_UNICODE');
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    requireThat(Number.isFinite(value), 'INVALID_NUMBER');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    requireThat(Object.keys(value).length === value.length, 'INVALID_JSON_ARRAY');
    return `[${value.map(item => canonicalJson(item, depth + 1)).join(',')}]`;
  }
  requireThat(value && Object.getPrototypeOf(value) === Object.prototype, 'INVALID_JSON_VALUE');
  return `{${Object.keys(value).sort().map(key => `${canonicalJson(key)}:${canonicalJson(value[key], depth + 1)}`).join(',')}}`;
}
export const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
export const canonicalDigest = value => sha256(canonicalJson(value));
const same = (a, b) => canonicalJson(a) === canonicalJson(b);
const addressEqual = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();

function spendPolicy(value) {
  requireThat(value && Object.keys(value).sort().join(',') === 'asset,max_amount_atomic,network,pay_to,policy_version', 'SPEND_POLICY_REQUIRED');
  requireThat(value.policy_version === AVU_POLICY_VERSION && typeof value.max_amount_atomic === 'string' && ATOMIC.test(value.max_amount_atomic), 'INVALID_SPEND_POLICY');
  requireThat(value.network === 'eip155:8453' && ADDRESS.test(value.asset) && ADDRESS.test(value.pay_to), 'INVALID_SPEND_POLICY');
  requireThat(!/^0x0{40}$/i.test(value.asset) && !/^0x0{40}$/i.test(value.pay_to), 'INVALID_SPEND_POLICY');
  return clone(value);
}
function termsMatch(terms, policy) {
  requireThat(terms && typeof terms.amount === 'string' && ATOMIC.test(terms.amount), 'INVALID_PAYMENT_AMOUNT');
  requireThat(BigInt(terms.amount) <= BigInt(policy.max_amount_atomic), 'PRICE_EXCEEDS_CAP');
  requireThat(terms.network === policy.network && addressEqual(terms.asset, policy.asset) && addressEqual(terms.payTo, policy.pay_to), 'PAYMENT_TERMS_MISMATCH');
}

export function artifactRequest({ jsonText, expectedSha256, clientRequestId }) {
  requireThat(typeof jsonText === 'string' && Buffer.byteLength(jsonText) >= 2 && Buffer.byteLength(jsonText) <= 65536, 'INVALID_ARTIFACT_SIZE');
  requireThat(typeof expectedSha256 === 'string' && DIGEST.test(expectedSha256), 'TRUSTED_DIGEST_REQUIRED');
  requireThat(typeof clientRequestId === 'string' && /^[A-Za-z0-9._:-]{1,64}$/.test(clientRequestId), 'INVALID_CLIENT_REQUEST_ID');
  try { canonicalJson(JSON.parse(jsonText)); } catch { throw new AVUBuyerError('INVALID_ARTIFACT_JSON'); }
  requireThat(sha256(jsonText) === expectedSha256, 'LOCAL_DIGEST_MISMATCH');
  return {
    client_request_id: clientRequestId,
    evidence: { media_type: 'application/json', content_base64: Buffer.from(jsonText).toString('base64') },
    assertions: [{ op: 'sha256_equals', expected_hex: expectedSha256.slice(7) }]
  };
}
export function requestDigest(request) {
  const bytes = Buffer.from(request.evidence.content_base64, 'base64');
  return canonicalDigest({
    version: 'verify-evidence-request/v1', client_request_id: request.client_request_id,
    evidence: { media_type: 'application/json', byte_length: bytes.length, sha256: sha256(bytes) },
    assertions: request.assertions
  });
}

export function readiness(health, manifest, now = Date.now()) {
  const reasons = [];
  const observed = Date.parse(health?.time);
  if (!Number.isFinite(observed) || now - observed > 120000 || observed - now > 30000) reasons.push('HEALTH_STALE_OR_UNKNOWN');
  if (health?.checks?.cost_basis_fresh !== true) reasons.push('COST_BASIS_STALE_OR_UNKNOWN');
  for (const key of ['deploy_enabled', 'runtime_enabled', 'payments_enabled']) {
    if (health?.checks?.[key] !== true) reasons.push(`${key.toUpperCase()}_FALSE_OR_UNKNOWN`);
  }
  if (health?.status !== 'ok' || manifest?.availability !== 'available') reasons.push('SERVICE_UNAVAILABLE');
  if (health?.service !== 'agent-verification-utility' || manifest?.id !== 'agent-verification-utility' ||
      health?.version !== manifest?.version || typeof health?.version !== 'string') reasons.push('DISCOVERY_MISMATCH');
  if (manifest?.endpoints?.purchase !== PURCHASE_URL || manifest?.endpoints?.validate_request !== `${AVU_ORIGIN}/validate-request`) reasons.push('ENDPOINT_MISMATCH');
  return { available: reasons.length === 0, reasons, version: health?.version ?? null };
}

export function validatePrecheck(data, request, policy) {
  requireThat(data?.schema_version === 'agent-economy/request-validation/3.0' && data.valid === true && data.supported === true &&
    data.spend_authorized === true && data.refusal_reason === null && data.verification_executed === false && data.payment_required === false, 'PRECHECK_REFUSED');
  const receipt = data.precheck_receipt;
  requireThat(receipt?.schema_version === 'agent-economy/precheck-receipt/2.0' && receipt.policy_version === AVU_POLICY_VERSION, 'PRECHECK_SCHEMA_MISMATCH');
  const { receipt_digest: digest, ...payload } = receipt;
  requireThat(DIGEST.test(digest) && canonicalDigest(payload) === digest, 'PRECHECK_DIGEST_MISMATCH');
  requireThat(receipt.request_check?.valid === true && receipt.request_check?.supported === true && receipt.request_check.request_hash === requestDigest(request), 'PRECHECK_REQUEST_MISMATCH');
  requireThat(receipt.dropped_evidence?.content_sha256 === sha256(Buffer.from(request.evidence.content_base64, 'base64')), 'PRECHECK_EVIDENCE_MISMATCH');
  requireThat(same(receipt.spend_policy, policy) && receipt.spend_policy_check?.allowed === true && receipt.decision?.spend_authorized === true &&
    receipt.decision?.explicit_payment_authorization_required === true && receipt.decision?.recommendation === 'review_before_payment', 'PRECHECK_POLICY_MISMATCH');
  requireThat(receipt.attestation?.level === 'unsigned_precheck' && receipt.attestation.signed === false &&
    same(receipt.unpaid_status, { state: 'unpaid', payment_required: false, payment_authorized: false, quote_created: false, transaction_created: false, verification_executed: false }), 'PRECHECK_NOT_UNPAID');
  const price = data.paid_execution;
  termsMatch({ amount: price?.price_atomic, asset: price?.asset, network: price?.network, payTo: price?.pay_to }, policy);
  requireThat(price.http_endpoint === PURCHASE_URL && price.mcp_tool === 'verify_evidence', 'ENDPOINT_MISMATCH');
  return clone(receipt);
}

function decodeHeader(value, code = 'MALFORMED_PAYMENT_HEADER') {
  requireThat(typeof value === 'string' && value.length > 0 && value.length <= 65536 && /^[A-Za-z0-9+/]+={0,2}$/.test(value), code);
  const bytes = Buffer.from(value, 'base64');
  requireThat(bytes.toString('base64').replace(/=+$/, '') === value.replace(/=+$/, ''), code);
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new AVUBuyerError(code); }
}
function validateBinding(binding, ctx, state, now, previous) {
  requireThat(binding?.schema_version === 'agent-economy/paid-verification-binding/1.0' && DIGEST.test(binding.binding_digest) && binding.state === state && binding.discovery_survived === true && binding.refusal_reason === null, 'INVALID_PAID_BINDING');
  requireThat(binding.precheck_receipt_digest === ctx.precheck.receipt_digest && binding.request_hash === requestDigest(ctx.request) &&
    binding.evidence_digest === sha256(Buffer.from(ctx.request.evidence.content_base64, 'base64')) &&
    binding.policy_version === AVU_POLICY_VERSION && binding.price_cap_atomic === ctx.policy.max_amount_atomic, 'PAID_BINDING_MISMATCH');
  termsMatch({ amount: binding.quoted_amount_atomic, network: binding.network, asset: binding.asset, payTo: binding.pay_to }, ctx.policy);
  requireThat(/^qte_[A-Za-z0-9_-]+$/.test(binding.quote_id) && Number.isFinite(Date.parse(binding.expires_at)), 'INVALID_QUOTE');
  if (state !== 'delivered') requireThat(Date.parse(binding.expires_at) > now + 5000 && binding.paid_receipt_id === null, 'QUOTE_EXPIRED');
  if (state === 'delivered') requireThat(/^rcpt_[A-Za-z0-9_-]+$/.test(binding.paid_receipt_id), 'MISSING_PAID_RECEIPT');
  if (previous) {
    for (const key of Object.keys(previous).filter(key => !['state', 'paid_receipt_id', 'refusal_reason'].includes(key))) {
      requireThat(same(binding[key], previous[key]), 'PAID_BINDING_CHANGED');
    }
  }
}
function signedPayload(evidence, keys) {
  requireThat(evidence?.signature?.alg === 'Ed25519' && /^[A-Za-z0-9_-]+$/.test(evidence.signed_payload_b64url) && /^[A-Za-z0-9_-]+$/.test(evidence.signature.value_b64url), 'INVALID_EVIDENCE_SIGNATURE');
  const key = keys.find(key => key.kid === evidence.signature.kid);
  requireThat(key?.kty === 'OKP' && key.crv === 'Ed25519' && !key.d, 'UNKNOWN_EVIDENCE_KEY');
  const bytes = Buffer.from(evidence.signed_payload_b64url, 'base64url');
  const sig = Buffer.from(evidence.signature.value_b64url, 'base64url');
  requireThat(bytes.length <= 32768 && sig.length === 64 && bytes.toString('base64url') === evidence.signed_payload_b64url &&
    sig.toString('base64url') === evidence.signature.value_b64url, 'INVALID_EVIDENCE_ENCODING');
  requireThat(verify(null, bytes, createPublicKey({ key, format: 'jwk' }), sig), 'INVALID_EVIDENCE_SIGNATURE');
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

export function verifyDelivery(data, paymentResponse, ctx, keys) {
  const binding = data?.receipt?.paid_verification_binding;
  validateBinding(binding, ctx, 'delivered', 0, ctx.binding);
  const settlement = decodeHeader(paymentResponse, 'MISSING_OR_INVALID_SETTLEMENT');
  requireThat(settlement.success === true && settlement.network === ctx.policy.network && /^0x[a-fA-F0-9]{64}$/.test(settlement.transaction), 'SETTLEMENT_UNCONFIRMED');
  requireThat(data.quote_id === binding.quote_id && data.request_hash === binding.request_hash &&
    data.receipt.receipt_id === binding.paid_receipt_id && data.receipt.delivery === 'completed' &&
    Number.isSafeInteger(data.receipt.price_paid_microusd) && String(data.receipt.price_paid_microusd) === binding.quoted_amount_atomic, 'DELIVERY_MISMATCH');
  const evidence = signedPayload(data.evidence, keys);
  const result = data.verification;
  requireThat(result && ['pass', 'fail'].includes(result.outcome) && result.algorithm_version === 'det-json-v1' &&
    Array.isArray(result.checks) && result.checks.length === ctx.request.assertions.length, 'INVALID_CHECKS');
  requireThat(result.checks.every((check, i) => check.index === i && check.op === ctx.request.assertions[i].op && typeof check.passed === 'boolean') &&
    (result.checks.every(check => check.passed) ? 'pass' : 'fail') === result.outcome, 'CHECK_OUTCOME_MISMATCH');
  const expected = {
    type: 'agent-verification-evidence/v1', evidence_id: data.evidence.evidence_id,
    transaction_id: data.transaction_id, request_hash: binding.request_hash, input_digest: binding.evidence_digest,
    algorithm_version: result.algorithm_version, executor_version: ctx.precheck.service_version,
    outcome: result.outcome, checks_digest: canonicalDigest(result.checks), executed_at: result.executed_at
  };
  requireThat(same(evidence, expected), 'SIGNED_RESULT_MISMATCH');
  const signedReceipt = data.fulfillment_proof?.verification_receipt;
  const receipt = signedPayload(signedReceipt, keys);
  requireThat(same(receipt, signedReceipt.payload) && receipt.type === 'agent-verification-receipt/v1' && receipt.schema_version === 1 &&
    receipt.receipt_id === binding.paid_receipt_id && receipt.request?.request_digest === binding.request_hash &&
    receipt.request?.evidence_digest === binding.evidence_digest, 'SIGNED_RECEIPT_MISMATCH');
  const payment = receipt.payment;
  requireThat(payment?.payment_protocol === 'x402-v2-exact' && payment.verification_status === 'verified' && payment.settlement_status === 'confirmed' &&
    payment.settlement_evidence_type === 'facilitator_response_with_transaction_hash' && payment.quote_id === binding.quote_id &&
    payment.transaction_hash === settlement.transaction && payment.amount_base_unit === binding.quoted_amount_atomic, 'SIGNED_SETTLEMENT_MISMATCH');
  termsMatch({ amount: payment.amount_base_unit, network: payment.network, asset: payment.asset, payTo: binding.pay_to }, ctx.policy);
  requireThat(receipt.request?.task_type === 'verify_evidence' &&
    same(receipt.request.checks_requested, ctx.request.assertions.map(check => check.op)) &&
    same(receipt.request.checks_performed, ctx.request.assertions.map(check => check.op)) &&
    same(receipt.request.checks_unsupported, []) &&
    receipt.verifier?.service_id === 'dev.kgninja.agent-economy/agent-verification-utility' &&
    receipt.verifier.service_version === ctx.precheck.service_version && receipt.verifier.algorithm_version === 'det-json-v1' &&
    receipt.verifier.policy_version === AVU_POLICY_VERSION, 'SIGNED_RECEIPT_SCOPE_MISMATCH');
  requireThat(receipt.result?.decision === result.outcome && receipt.result?.evidence_id === data.evidence.evidence_id, 'SIGNED_RECEIPT_RESULT_MISMATCH');
  return { state: 'delivered', outcome: result.outcome, payment: 'facilitator_reported_settled', evidence: 'signature_verified',
    receipt: 'signature_verified', independentOnchainVerification: false, realWorldTruthVerified: false,
    transactionId: data.transaction_id, quoteId: data.quote_id, receiptId: data.receipt.receipt_id };
}

function savedContext(ctx) {
  return clone({ schemaVersion: 'avu-reconciliation-context/v1', request: ctx.request,
    policy: ctx.policy, precheck: ctx.precheck, binding: ctx.binding, keys: ctx.keys });
}

/** Verify a previously saved response without network, wallet, signing or retry. */
export function reconcileSavedDelivery({ rawResponse, paymentResponse, context, journalRecord } = {}) {
  requireThat(typeof rawResponse === 'string' && Buffer.byteLength(rawResponse) > 0 &&
    Buffer.byteLength(rawResponse) <= MAX_RESPONSE_BYTES, 'INVALID_SAVED_RESPONSE');
  requireThat(context?.schemaVersion === 'avu-reconciliation-context/v1' && context.request &&
    context.policy && context.precheck && context.binding && Array.isArray(context.keys), 'INVALID_RECONCILIATION_CONTEXT');
  const ctx = clone(context);
  delete ctx.schemaVersion;
  spendPolicy(ctx.policy);
  requireThat(ctx.keys.length > 0 && ctx.keys.length <= 16 && ctx.keys.every(key =>
    key?.kty === 'OKP' && key.crv === 'Ed25519' && typeof key.kid === 'string' && !key.d), 'INVALID_RECONCILIATION_KEYS');
  validatePrecheck({ schema_version: 'agent-economy/request-validation/3.0', valid: true, supported: true,
    spend_authorized: true, refusal_reason: null, verification_executed: false, payment_required: false,
    precheck_receipt: ctx.precheck, paid_execution: { price_atomic: ctx.binding.quoted_amount_atomic,
      asset: ctx.binding.asset, network: ctx.binding.network, pay_to: ctx.binding.pay_to,
      http_endpoint: PURCHASE_URL, mcp_tool: 'verify_evidence' } }, ctx.request, ctx.policy);
  const expiry = Date.parse(ctx.binding.expires_at);
  requireThat(Number.isFinite(expiry), 'INVALID_RECONCILIATION_CONTEXT');
  validateBinding(ctx.binding, ctx, 'payment_required', expiry - 6000);
  requireThat(journalRecord?.schemaVersion === 'avu-purchase-journal/v1' && journalRecord.retryAllowed === false &&
    ['submitting', 'unknown', 'delivered'].includes(journalRecord.state) &&
    journalRecord.requestHash === requestDigest(ctx.request) &&
    journalRecord.evidenceDigest === ctx.binding.evidence_digest &&
    journalRecord.precheckDigest === ctx.precheck.receipt_digest &&
    journalRecord.bindingDigest === ctx.binding.binding_digest &&
    journalRecord.quoteId === ctx.binding.quote_id && journalRecord.amountAtomic === ctx.binding.quoted_amount_atomic &&
    journalRecord.network === ctx.policy.network && addressEqual(journalRecord.asset, ctx.policy.asset) &&
    addressEqual(journalRecord.payTo, ctx.policy.pay_to) && journalRecord.expiresAt === ctx.binding.expires_at,
    'JOURNAL_RECONCILIATION_MISMATCH');
  let data;
  try { data = JSON.parse(rawResponse); } catch { throw new AVUBuyerError('INVALID_SAVED_RESPONSE'); }
  const summary = verifyDelivery(data, paymentResponse, ctx, ctx.keys);
  return { ...summary, reconciliation: 'offline_saved_response_verified', previousJournalState: journalRecord.state,
    journalUpdateRequired: journalRecord.state !== 'delivered', networkAccessed: false, walletAccessed: false,
    retryAuthorized: false };
}

/** Fixed-origin transport with no redirects, credentials, generic retries or raw logs. */
export function createAVUBuyer({ fetchImpl = fetch, now = Date.now, purchaseJournal } = {}) {
  requireThat(purchaseJournal === undefined || (purchaseJournal &&
    typeof purchaseJournal.claim === 'function' && typeof purchaseJournal.record === 'function'), 'INVALID_PURCHASE_JOURNAL');
  const sessions = new WeakMap();
  const events = [];
  const errorCode = error => error instanceof AVUBuyerError ? error.code : 'INVALID_RESPONSE';
  const event = (stage, code = null) => events.push({ stage, code, at: new Date(now()).toISOString() });
  async function http(path, { body, headers = {}, statuses = [200] } = {}) {
    let response;
    try {
      response = await fetchImpl(`${AVU_ORIGIN}${path}`, {
        method: body === undefined ? 'GET' : 'POST', redirect: 'error', credentials: 'omit',
        signal: AbortSignal.timeout(20000), cache: 'no-store',
        headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
        ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) })
      });
    } catch { throw new AVUBuyerError('NETWORK_ERROR'); }
    requireThat(!response.redirected, 'REDIRECT_REFUSED');
    requireThat(!response.headers.get('content-length') || Number(response.headers.get('content-length')) <= MAX_RESPONSE_BYTES, 'RESPONSE_TOO_LARGE');
    const reader = response.body.getReader(); const chunks = []; let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.length;
        if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new AVUBuyerError('RESPONSE_TOO_LARGE'); }
        chunks.push(value);
      }
    } catch (error) { throw error instanceof AVUBuyerError ? error : new AVUBuyerError('NETWORK_ERROR'); }
    const raw = Buffer.concat(chunks).toString('utf8'); let data;
    try { data = JSON.parse(raw); } catch { throw new AVUBuyerError('INVALID_SERVICE_JSON'); }
    if (!statuses.includes(response.status)) {
      const code = data?.error?.code;
      throw new AVUBuyerError(typeof code === 'string' && /^[A-Z0-9_]{1,80}$/.test(code) ? code : `HTTP_${response.status}`);
    }
    return { response, data, raw };
  }
  async function inspect() {
    const [h, m] = await Promise.all([http('/health'), http('/agent.json')]);
    return { ...readiness(h.data, m.data, now()), health: h.data, manifest: m.data };
  }
  return {
    inspect,
    events: () => clone(events),
    async prepare(options) {
      try {
      const request = artifactRequest(options);
      if (options.requiresSignedReceipt !== true) {
        event('local_only');
        return { state: 'local_only', reason: 'LOCAL_HASH_CHECK_SUFFICIENT', evidenceSent: false, paymentAuthorized: false };
      }
      requireThat(options.allowEvidenceUpload === true, 'EVIDENCE_UPLOAD_NOT_AUTHORIZED');
      const policy = spendPolicy(options.spendPolicy);
      requireThat(typeof options.idempotencyKey === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(options.idempotencyKey), 'IDEMPOTENCY_KEY_REQUIRED');
      const status = await inspect();
      if (!status.available) { event('blocked', status.reasons[0]); return { state: 'blocked', reasons: status.reasons, evidenceSent: false, paymentAuthorized: false }; }
      const response = await http('/validate-request', { body: { request, spend_policy: policy } });
      const precheck = validatePrecheck(response.data, request, policy);
      requireThat(precheck.service_version === status.version, 'DISCOVERY_CHANGED');
      const card = (await http('/mcp/server-card')).data;
      requireThat(canonicalDigest(card) === precheck.mcp_server_card?.canonical_sha256, 'MCP_CARD_CHANGED');
      const keys = (await http('/.well-known/jwks.json')).data.keys;
      requireThat(Array.isArray(keys) && keys.some(key => key.kty === 'OKP' && key.crv === 'Ed25519' && !key.d), 'EVIDENCE_KEY_UNAVAILABLE');
      const handle = Object.freeze({ state: 'prepared', benefit: 'Ed25519-signed execution evidence for these exact artifact bytes',
        priceAtomic: response.data.paid_execution.price_atomic, network: policy.network, asset: policy.asset,
        payTo: policy.pay_to, resource: PURCHASE_URL, paymentAuthorized: false, quoteCreated: false });
      sessions.set(handle, { state: 'prepared', request, policy, precheck, keys, idempotencyKey: options.idempotencyKey,
        body: JSON.stringify({ request, spend_policy: policy, precheck_receipt_digest: precheck.receipt_digest }) });
      event('precheck_passed'); return handle;
      } catch (error) {
        event('preparation_failed', errorCode(error));
        throw new AVUBuyerError(errorCode(error));
      }
    },
    async requestChallenge(handle) {
      const ctx = sessions.get(handle);
      requireThat(ctx?.state === 'prepared', 'PREPARED_SESSION_REQUIRED');
      ctx.state = 'requesting_challenge';
      try {
        const status = await inspect(); requireThat(status.available, status.reasons[0] || 'SERVICE_UNAVAILABLE');
        const quote = (await http('/quote', { body: ctx.body, headers: { 'Idempotency-Key': ctx.idempotencyKey } })).data;
        validateBinding(quote.paid_verification_binding, ctx, 'quoted', now());
        requireThat(quote.purchase?.url === PURCHASE_URL && quote.purchase.method === 'POST' && quote.purchase.quote_header === 'X-Quote-ID' &&
          quote.quote_id === quote.paid_verification_binding.quote_id && quote.request_hash === requestDigest(ctx.request), 'QUOTE_MISMATCH');
        event('quote_created');
        const challenge = await http('/verify-evidence', { body: ctx.body, headers: { 'X-Quote-ID': quote.quote_id, 'Idempotency-Key': ctx.idempotencyKey }, statuses: [402] });
        const required = decodeHeader(challenge.response.headers.get('PAYMENT-REQUIRED'));
        requireThat(required.x402Version === 2 && required.resource?.url === PURCHASE_URL && Array.isArray(required.accepts) && required.accepts.length === 1, 'INVALID_X402_CHALLENGE');
        const requirement = required.accepts[0];
        requireThat(requirement.scheme === 'exact' && Number.isSafeInteger(requirement.maxTimeoutSeconds) && requirement.maxTimeoutSeconds > 0, 'UNSUPPORTED_X402_REQUIREMENT');
        termsMatch(requirement, ctx.policy);
        requireThat(same(required.accepts, challenge.data.accepts) && same(required.resource, challenge.data.resource) && same(required.extensions, challenge.data.extensions), 'CHALLENGE_HEADER_BODY_MISMATCH');
        validateBinding(challenge.data.paid_verification_binding, ctx, 'payment_required', now(), quote.paid_verification_binding);
        requireThat(requirement.amount === challenge.data.paid_verification_binding.quoted_amount_atomic, 'CHALLENGE_AMOUNT_MISMATCH');
        ctx.binding = clone(challenge.data.paid_verification_binding); ctx.required = clone(required); ctx.requirement = clone(requirement);
        ctx.state = 'awaiting_authorization'; event('challenge_ready');
        return { state: ctx.state, paymentRequired: clone(required), binding: clone(ctx.binding), paymentAuthorized: false };
      } catch (error) { ctx.state = 'refused'; event('refused', errorCode(error)); throw new AVUBuyerError(errorCode(error)); }
    },
    async pay(handle, { authorizePayment } = {}) {
      const ctx = sessions.get(handle);
      requireThat(ctx?.state === 'awaiting_authorization', 'CHALLENGE_REQUIRED');
      requireThat(typeof authorizePayment === 'function', 'HOST_AUTHORIZATION_REQUIRED');
      // Lock before any await: concurrent calls cannot sign or submit twice.
      ctx.state = 'authorizing';
      let submitted = false;
      let evidenceToReview;
      let reconciliationContext;
      let journalTicket;
      let journalTerminal = false;
      const journalRecord = async state => {
        try { await purchaseJournal.record(journalTicket, state); }
        catch { throw new AVUBuyerError('JOURNAL_WRITE_FAILED'); }
      };
      try {
        const status = await inspect(); requireThat(status.available, status.reasons[0] || 'SERVICE_UNAVAILABLE');
        validateBinding(ctx.binding, ctx, 'payment_required', now());
        if (purchaseJournal) {
          try {
            journalTicket = await purchaseJournal.claim(ctx.idempotencyKey, {
              requestHash: requestDigest(ctx.request), evidenceDigest: ctx.binding.evidence_digest,
              precheckDigest: ctx.precheck.receipt_digest, bindingDigest: ctx.binding.binding_digest,
              quoteId: ctx.binding.quote_id, amountAtomic: ctx.binding.quoted_amount_atomic,
              network: ctx.policy.network, asset: ctx.policy.asset, payTo: ctx.policy.pay_to, expiresAt: ctx.binding.expires_at
            });
            requireThat(journalTicket != null, 'JOURNAL_WRITE_FAILED');
          } catch (error) {
            throw new AVUBuyerError(error instanceof AVUBuyerError && error.code === 'PURCHASE_ALREADY_RECORDED'
              ? 'PURCHASE_ALREADY_RECORDED' : 'JOURNAL_WRITE_FAILED');
          }
        }
        validateBinding(ctx.binding, ctx, 'payment_required', now());
        const signed = await authorizePayment({ paymentRequired: clone(ctx.required), binding: clone(ctx.binding),
          spendPolicy: clone(ctx.policy), purpose: 'Signed execution receipt for artifact integrity', idempotencyKey: ctx.idempotencyKey });
        if (signed == null) {
          if (journalTicket) { await journalRecord('refused'); journalTerminal = true; }
          ctx.state = 'refused'; event('authorization_declined'); return { state: 'refused', reason: 'AUTHORIZATION_DECLINED' };
        }
        validateBinding(ctx.binding, ctx, 'payment_required', now());
        const payload = decodeHeader(signed, 'INVALID_WALLET_PAYLOAD');
        requireThat(payload.x402Version === 2 && payload.resource?.url === PURCHASE_URL && same(payload.accepted, ctx.requirement), 'WALLET_TERMS_MISMATCH');
        // This adapter supports native USDC EIP-3009 only; Permit2 requires a
        // separately reviewed adapter, never an implicit broader approval.
        const auth = payload.payload?.authorization;
        requireThat(auth && ADDRESS.test(auth.from) && addressEqual(auth.to, ctx.policy.pay_to) &&
          auth.value === ctx.requirement.amount && /^0x[a-fA-F0-9]{64}$/.test(auth.nonce) &&
          /^0x[a-fA-F0-9]+$/.test(payload.payload.signature), 'INVALID_EIP3009_AUTHORIZATION');
        requireThat(/^[0-9]{1,12}$/.test(auth.validBefore) && /^[0-9]{1,12}$/.test(auth.validAfter) &&
          Number(auth.validAfter) * 1000 <= now() && Number(auth.validBefore) * 1000 > now() &&
          Number(auth.validBefore) * 1000 <= Date.parse(ctx.binding.expires_at), 'INVALID_AUTHORIZATION_EXPIRY');
        if (journalTicket) await journalRecord('submitting');
        validateBinding(ctx.binding, ctx, 'payment_required', now());
        requireThat(Number(auth.validBefore) * 1000 > now(), 'INVALID_AUTHORIZATION_EXPIRY');
        reconciliationContext = savedContext(ctx);
        event('authorized'); ctx.state = 'submitting'; submitted = true;
        const response = await http('/verify-evidence', { body: ctx.body, headers: { 'X-Quote-ID': ctx.binding.quote_id,
          'Idempotency-Key': ctx.idempotencyKey, 'PAYMENT-SIGNATURE': signed } });
        const paymentResponse = response.response.headers.get('PAYMENT-RESPONSE');
        evidenceToReview = { rawResponse: response.raw, paymentResponse };
        const summary = verifyDelivery(response.data, paymentResponse, ctx, ctx.keys);
        if (journalTicket) { await journalRecord('delivered'); journalTerminal = true; }
        ctx.state = 'delivered'; event('delivery_verified');
        // Caller stores these in its own protected evidence store, not telemetry.
        return { ...summary, rawResponse: response.raw, paymentResponse };
      } catch (error) {
        if (journalTicket && !journalTerminal) {
          // Preserve the exclusion even if the status write also fails. No
          // retry, new signature or deletion is permitted after uncertainty.
          try { await journalRecord('unknown'); } catch { event('journal_write_failed', 'JOURNAL_WRITE_FAILED'); }
        }
        ctx.state = submitted ? 'unknown' : 'refused'; event(ctx.state, errorCode(error));
        if (submitted) return { state: 'unknown', reason: errorCode(error), quoteId: ctx.binding.quote_id,
          ...(evidenceToReview ? { evidenceToReview } : {}),
          ...(reconciliationContext ? { reconciliationContext } : {}),
          idempotencyKey: ctx.idempotencyKey, nextAction: 'Reconcile this exact quote; do not sign again or start a new purchase.' };
        throw new AVUBuyerError(errorCode(error));
      }
    }
  };
}
