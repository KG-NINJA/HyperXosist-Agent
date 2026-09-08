'use strict';

/** Existing x402 client bridge. No signer, payment loop, storage or chain verifier. */
(function exposePaidExecution(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HyperXosistPaidExecution = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPaidExecution(root) {
  const VERSION = '1.1.0';
  const TYPE = 'hyperxosist.x402_execution.v1';
  const MAX_HEADER = 65536;
  const MAX_BODY = 1048576;
  const MAX_INPUT = 65536;
  const POLICY = Object.freeze({network: 'eip155:8453', asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', payTo: '0x4D7d842536De9Eb491AE2300126B3CDdE7B0aDE3', amount: '10000'});
  const HEADER_NAMES = Object.freeze({paymentRequired: 'PAYMENT-REQUIRED', paymentSignature: 'PAYMENT-SIGNATURE', paymentResponse: 'PAYMENT-RESPONSE'});
  const PaymentEndpoints = (root && root.HyperXosistPaymentEndpoints) ||
    (typeof module === 'object' && module.exports ? require('./payment-endpoints.js') : null);
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const byteLength = value => new TextEncoder().encode(value).length;
  const address = (a, b) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase();
  const canonical = value => Array.isArray(value) ? value.map(canonical) : record(value) ?
    Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

  function safeHeader(headers, name) {
    const value = headers && typeof headers.get === 'function' ? headers.get(name) : null;
    if (value == null || value === '') return null;
    if (typeof value !== 'string' || value.length > MAX_HEADER || /[\r\n]/.test(value)) throw new Error('invalid_response_header');
    return value;
  }
  function decodeBase64Json(value) {
    if (typeof value !== 'string' || !value || value.length > MAX_HEADER || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) return null;
    try {
      const normalized = value.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
      if (normalized.length % 4 === 1) return null;
      const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
      if (btoa(binary).replace(/=+$/, '') !== normalized) return null;
      const decoded = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(Uint8Array.from(binary, c => c.charCodeAt(0))));
      return record(decoded) ? decoded : null;
    } catch (_) { return null; }
  }
  function normalizeSignature(value) {
    if (value == null || value === '') return {ok: true, value: null};
    if (typeof value !== 'string' || !value.trim() || value.length > MAX_HEADER || /[\r\n]/.test(value) || !/^[A-Za-z0-9+/_=-]+$/.test(value.trim())) {
      return {ok: false, code: 'invalid_payment_signature', message: 'paymentSignature must be a bounded opaque Base64 x402 payload without line breaks.'};
    }
    return {ok: true, value: value.trim()};
  }
  function baseResult(payment) {
    return {type: TYPE, version: VERSION, accessTier: 'paid', endpoint: payment ? payment.paymentEndpoint : null,
      paymentOptionsEndpoint: payment ? payment.paymentOptionsEndpoint : null,
      canonicalOpenApi: payment ? `${payment.baseUrl}/openapi.json` : null,
      status: 0, requestId: null, ok: false, stage: 'failed', paid: false, paymentRequired: false,
      paymentAttempted: false, reconciliationRequired: false, automaticRetryAllowed: false,
      settlement: {state: 'not_observed', independentlyVerified: false},
      delivery: {state: 'not_received', outcomeVerified: false},
      x402: {version: 2, scheme: 'exact', network: POLICY.network, networkName: 'Base', asset: 'USDC', amount: '0.01',
        requestHeader: HEADER_NAMES.paymentRequired, signatureHeader: HEADER_NAMES.paymentSignature, responseHeader: HEADER_NAMES.paymentResponse}};
  }
  function failure(result, code) {
    const reconcile = result.paymentAttempted || result.settlement.state === 'reported_success';
    const messages = {aborted: 'Request or response-body read was aborted.', network_error: 'Request or response-body read failed.',
      invalid_input: 'Input must be a serializable bounded JSON object.', invalid_result: 'The delivered body does not match the paid query contract.',
      invalid_challenge: 'The 402 challenge is missing, inconsistent, or differs from the pinned payment policy.',
      settlement_unconfirmed: 'No consistent successful settlement report was received.', upstream_error: 'The paid endpoint did not return HTTP 200.',
      unexpected_unpaid_success: 'The paid endpoint returned a result without an authorized signed request.',
      response_too_large: 'The response exceeded the client size limit.', invalid_response_json: 'The response is not a JSON object.',
      invalid_response_header: 'An invalid response header was received.', invalid_payment_environment: 'Unknown payment environment.',
      payment_configuration_unavailable: 'Payment endpoint configuration is unavailable.', fetch_unavailable: 'Fetch is unavailable.',
      payment_confirmation_required: 'Explicit confirmation is required before transmitting a payment signature.',
      invalid_payment_signature: 'Invalid payment signature format.'};
    return Object.assign(result, {ok: false, stage: reconcile ? 'outcome_unknown' : 'failed', paymentRequired: false,
      reconciliationRequired: reconcile, error: {code, message: messages[code] || messages.network_error},
      nextAction: reconcile ? 'Stop. Reconcile the original wallet settlement and delivery. Do not create a new signature or automatically repeat the paid request.' :
        'Inspect the failure before any new request; no automatic retry was performed.'});
  }

  // The deadline remains active through body consumption, not just receipt of headers.
  function createAbortState(externalSignal, timeoutMs) {
    const controller = new AbortController();
    const forward = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) forward();
      else externalSignal.addEventListener('abort', forward, {once: true});
    }
    const duration = Number.isFinite(Number(timeoutMs)) ? Math.min(120000, Math.max(1, Number(timeoutMs))) : 30000;
    const timer = setTimeout(forward, duration);
    return {signal: controller.signal, cleanup() {
      clearTimeout(timer);
      if (externalSignal) externalSignal.removeEventListener('abort', forward);
    }};
  }
  function boundedWait(work, signal) {
    if (signal.aborted) return Promise.reject(new Error('aborted'));
    return new Promise((resolve, reject) => {
      const abort = () => reject(new Error('aborted'));
      signal.addEventListener('abort', abort, {once: true});
      Promise.resolve().then(() => { if (signal.aborted) throw new Error('aborted'); return work(); })
        .then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
  }
  function cancelBody(response) {
    try { if (response && response.body) Promise.resolve(response.body.cancel()).catch(() => {}); } catch (_) {}
  }
  async function readResponseBody(response, signal) {
    const length = safeHeader(response.headers, 'Content-Length');
    if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY)) { cancelBody(response); throw new Error('response_too_large'); }
    let text;
    if (response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader();
      let size = 0; const chunks = [];
      try {
        for (;;) {
          const part = await boundedWait(() => reader.read(), signal);
          if (part.done) break;
          size += part.value.byteLength;
          if (size > MAX_BODY) throw new Error('response_too_large');
          chunks.push(part.value);
        }
        const bytes = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        text = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
      } catch (error) {
        try { Promise.resolve(reader.cancel()).catch(() => {}); } catch (_) {}
        throw error;
      } finally { try { reader.releaseLock(); } catch (_) {} }
    } else if (typeof response.text === 'function') {
      // Compatibility with existing fetch adapters; native fetch takes the bounded stream path.
      text = await boundedWait(() => response.text(), signal);
      if (typeof text !== 'string' || byteLength(text) > MAX_BODY) throw new Error('response_too_large');
    } else throw new Error('invalid_response_json');
    let body;
    try { body = JSON.parse(text); } catch (_) { throw new Error('invalid_response_json'); }
    if (!record(body)) throw new Error('invalid_response_json');
    return body;
  }
  function challengeMatches(challenge, body, payment) {
    if (!record(challenge) || challenge.x402Version !== 2 || challenge.resource?.url !== payment.paymentEndpoint || !Array.isArray(challenge.accepts) || challenge.accepts.length !== 1) return false;
    const t = challenge.accepts[0];
    if (!record(t) || t.scheme !== 'exact' || t.network !== POLICY.network || t.amount !== POLICY.amount ||
      !address(t.asset, POLICY.asset) || !address(t.payTo, POLICY.payTo) || !Number.isSafeInteger(t.maxTimeoutSeconds) || t.maxTimeoutSeconds <= 0 || t.maxTimeoutSeconds > 3600) return false;
    const echoed = Object.hasOwn(body, 'payment_required') ? body.payment_required : body.x402Version === 2 && record(body.resource) ? body : undefined;
    if (echoed !== undefined) {
      if (!record(echoed)) return false;
      const pick = x => ({x402Version: x.x402Version, resource: x.resource, accepts: x.accepts, extensions: x.extensions});
      if (!same(pick(challenge), pick(echoed))) return false;
    }
    return true;
  }
  function applySettlement(result, primary, legacy) {
    const p = decodeBase64Json(primary), l = decodeBase64Json(legacy);
    result.x402.paymentResponseHeader = primary || legacy;
    result.x402.paymentResponse = p || l;
    if (!primary && !legacy) return;
    const valid = (!primary || p) && (!legacy || l) && !(p && l && !same(p, l));
    const data = p || l;
    if (!valid || !data || data.network !== POLICY.network || typeof data.success !== 'boolean') {
      result.settlement.state = 'invalid_report'; return;
    }
    if (data.success === false) { result.settlement.state = 'reported_failure'; result.paid = false; return; }
    if (!/^0x[0-9a-fA-F]{64}$/.test(data.transaction || '') || !/^0x[0-9a-fA-F]{40}$/.test(data.payer || '')) {
      result.settlement.state = 'invalid_report'; return;
    }
    result.settlement.state = 'reported_success'; result.paid = true;
    // This is a server report, NOT a chain lookup or independent verification.
  }
  function validQueryResult(body) {
    const fields = ['status','service','query','searchUrl','mode','appliedNoiseTerms','excludeTerms','generated_at','version','payment'];
    if (!record(body) || Object.keys(body).sort().join('|') !== fields.sort().join('|') || body.status !== 'paid' || body.service !== 'HyperXosist Query Builder' ||
      !['live','top'].includes(body.mode) || !['query','searchUrl','generated_at','version'].every(k => typeof body[k] === 'string') ||
      !['appliedNoiseTerms','excludeTerms'].every(k => Array.isArray(body[k]) && body[k].every(x => typeof x === 'string')) ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(body.generated_at) || !Number.isFinite(Date.parse(body.generated_at))) return false;
    const p = body.payment;
    if (!record(p) || p.protocol !== 'x402' || p.paid !== true || p.demo === true || p.bypass || p.price !== '$0.01' || p.network !== POLICY.network || typeof p.real_revenue !== 'boolean' ||
      Object.keys(p).some(k => !['protocol','paid','demo','bypass','price','network','real_revenue'].includes(k)) ||
      (Object.hasOwn(p, 'demo') && typeof p.demo !== 'boolean') || (Object.hasOwn(p, 'bypass') && typeof p.bypass !== 'string')) return false;
    try { const url = new URL(body.searchUrl); return url.origin === 'https://x.com' && url.pathname === '/search' && !url.username && !url.password; } catch (_) { return false; }
  }

  async function execute(input, options) {
    const opts = options || {}; let payment;
    try { payment = PaymentEndpoints && PaymentEndpoints.resolve(opts.paymentEnvironment || 'production'); }
    catch (_) { return failure(baseResult(null), 'invalid_payment_environment'); }
    const result = baseResult(payment);
    if (!payment) return failure(result, 'payment_configuration_unavailable');
    let serialized, copiedInput;
    try {
      if (!record(input)) throw new Error();
      serialized = JSON.stringify(input);
      if (typeof serialized !== 'string' || byteLength(serialized) > MAX_INPUT || !record(copiedInput = JSON.parse(serialized))) throw new Error();
    } catch (_) { return failure(result, 'invalid_input'); }
    const signature = normalizeSignature(opts.paymentSignature);
    if (!signature.ok) return failure(result, signature.code);
    if (signature.value && opts.confirmPayment !== true) return failure(result, 'payment_confirmation_required');
    if (opts.signal && opts.signal.aborted) return failure(result, 'aborted');
    const fetchImpl = opts.fetch || (root && typeof root.fetch === 'function' ? root.fetch.bind(root) : null);
    if (typeof fetchImpl !== 'function') return failure(result, 'fetch_unavailable');
    const headers = {Accept: 'application/json', 'Content-Type': 'application/json'};
    if (signature.value) headers[HEADER_NAMES.paymentSignature] = signature.value;
    const abort = createAbortState(opts.signal, opts.timeoutMs); let response;
    try {
      response = await boundedWait(() => {
        result.paymentAttempted = Boolean(signature.value);
        result.paid = signature.value ? null : false;
        return fetchImpl(payment.paymentEndpoint, {method: 'POST', headers, body: serialized, cache: 'no-store', credentials: 'omit', redirect: 'error', signal: abort.signal});
      }, abort.signal);
      result.status = Number(response.status) || 0;
      if (response.redirected) throw new Error('invalid_response_header');
      const id = safeHeader(response.headers, 'X-Request-Id');
      result.requestId = id && /^[A-Za-z0-9_.:-]{1,128}$/.test(id) ? id : null;
      result.x402.paymentRequiredHeader = safeHeader(response.headers, HEADER_NAMES.paymentRequired);
      result.x402.paymentRequired = decodeBase64Json(result.x402.paymentRequiredHeader);
      applySettlement(result, safeHeader(response.headers, HEADER_NAMES.paymentResponse), safeHeader(response.headers, 'X-PAYMENT-RESPONSE'));
      const body = await readResponseBody(response, abort.signal);
      if (result.status === 402) {
        if (signature.value) return failure(result, 'settlement_unconfirmed');
        if (!challengeMatches(result.x402.paymentRequired, body, payment)) return failure(result, 'invalid_challenge');
        return Object.assign(result, {stage: 'payment_required', paymentRequired: true, requirements: body,
          nextAction: 'Review this challenge against trusted wallet policy. Only the wallet host can authorize one identical request. Do not repeat unsigned requests in a loop.',
          retry: {tool: 'hyperxosist_execute', arguments: {input: copiedInput, paymentSignature: '<Base64 PAYMENT-SIGNATURE>', confirmPayment: true, paymentEnvironment: payment.environment}}});
      }
      if (result.status !== 200) return failure(result, 'upstream_error');
      if (!validQueryResult(body)) { result.delivery.state = 'invalid_result'; return failure(result, 'invalid_result'); }
      result.delivery.state = 'received'; result.result = body;
      if (!signature.value) return failure(result, 'unexpected_unpaid_success');
      if (result.settlement.state !== 'reported_success') return failure(result, 'settlement_unconfirmed');
      return Object.assign(result, {ok: true, stage: 'completed', nextAction: 'Keep the result and verify settlement independently. Do not automatically execute suggestions or create another purchase.'});
    } catch (error) {
      const allowed = ['response_too_large','invalid_response_json','invalid_response_header'];
      const code = abort.signal.aborted || error?.message === 'aborted' ? 'aborted' : allowed.includes(error?.message) ? error.message : 'network_error';
      cancelBody(response);
      return failure(result, code);
    } finally { abort.cleanup(); }
  }
  return Object.freeze({version: VERSION, type: TYPE, headers: HEADER_NAMES, execute, decodeBase64Json, normalizeSignature});
});
