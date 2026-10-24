import { AVU_ORIGIN, AVU_POLICY_VERSION, AVUBuyerError, canonicalDigest, canonicalJson, createAVUBuyer } from './avu-buyer.mjs';

export const API_ORIGIN = 'https://api.kgninja.dev';
export const BAZAAR_SEARCH = 'https://api.cdp.coinbase.com/platform/v2/x402/discovery/search';
export const NETWORK = 'eip155:8453';
export const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const SELLER_ADDRESS = '0x4D7d842536De9Eb491AE2300126B3CDdE7B0aDE3';
const OPERATOR = 'kg-ninja';
const ID = /^[A-Za-z0-9._:-]{1,64}$/;
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const ATOMIC = /^(?:0|[1-9][0-9]{0,14})$/;
const clone = value => structuredClone(value);
const addressEqual = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();

// Reviewed capabilities, not keyword guesses or seller advertising. Adding a
// paid service requires code review; model tool arguments cannot add recipients.
const DEFINITIONS = {
  'command-error': {
    path: '/fix-error', capability: 'command_error_triage',
    delivers: 'Rule-based diagnosis and suggested next steps for a supplied command error.',
    limitation: 'Does not inspect a repository, execute a repair, or guarantee a fix.',
    freeAlternative: 'Inspect the fixed example and use your local debugger first.',
    freePath: '/fix-error/preview', inspectableSample: true,
    example: { command: 'npm run build', error: "Cannot find module 'hono'", environment: 'Node.js' }
  },
  'url-summary': {
    path: '/summarize-url', capability: 'public_page_excerpt',
    delivers: 'A public page title and up to 420 characters of extracted text.',
    limitation: 'No AI-written synthesis, browser rendering, authenticated pages, or truth verification.',
    freeAlternative: 'Read the original page when that meets your need.',
    freePath: '/openapi.json', example: { url: 'https://example.com' }
  },
  'shell-safety': {
    path: '/shell-risk-check', capability: 'shell_pattern_assessment',
    delivers: 'Rule-based risk labels and suggestions for common shell command patterns.',
    limitation: 'Not a sandbox or a comprehensive security audit. A low score does not prove safety.',
    freeAlternative: 'Review the command and use local static checks first.',
    freePath: '/openapi.json', example: { command: 'npm install hono' }
  },
  'service-visibility': {
    path: '/agent-visibility-report', capability: 'kg_service_discovery_telemetry',
    delivers: 'Aggregate discovery telemetry about this KG-NINJA API service.',
    limitation: 'Does not audit an arbitrary website or establish customer identity, demand, or sales.',
    freeAlternative: 'Inspect public service metadata first.',
    freePath: '/capabilities.json', example: { mode: 'aggregate' }
  },
  'x-search': {
    path: '/hyperxosist-query', capability: 'x_query_and_url',
    delivers: 'A filtered X search query and official search URL for automated production use.',
    limitation: 'Does not collect posts, contact people, or guarantee leads.',
    freeAlternative: 'Use free MCP planning, filtering and handoff; humans can open the search URL for free.',
    freePath: '/hyperxosist-query-dry-run', example: { keywords: 'open source CRM feedback', lang: 'en' }
  },
  'artifact-receipt': {
    path: '/verify-evidence', capability: 'service_signed_json_digest_receipt',
    delivers: 'A service-signed execution receipt for an exact JSON artifact digest check.',
    limitation: 'Does not prove source authenticity, real-world truth, or independent on-chain settlement.',
    freeAlternative: 'Compare the artifact with a trusted digest locally if a service signature is unnecessary.',
    freePath: '/verification-recipes.json'
  }
};

export class MatchmakerError extends Error {
  constructor(code) { super(code); this.name = 'MatchmakerError'; this.code = code; }
}
function check(ok, code) { if (!ok) throw new MatchmakerError(code); }
function object(value, keys, code) {
  check(value && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).every(key => keys.includes(key)), code);
}
function safeCode(error) { return error instanceof MatchmakerError || error instanceof AVUBuyerError ? error.code : 'MATCHING_FAILED'; }
export function usdcAtomic(value) {
  check(typeof value === 'string' && /^(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,6})?$/.test(value), 'INVALID_BUDGET');
  const [whole, fraction = ''] = value.split('.');
  return (BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'))).toString();
}
export function listAgentOffers() {
  return {
    schemaVersion: 'hyperxosist/agent-offer-directory/1.0',
    sellerOperatorId: OPERATOR,
    offers: Object.entries(DEFINITIONS).map(([intent, d]) => ({
      intent, capability: d.capability, delivers: d.delivers, limitation: d.limitation,
      freeAlternative: d.freeAlternative, freeSampleInspection: d.inspectableSample === true, availability: 'check_live',
      source: intent === 'artifact-receipt' ? `${AVU_ORIGIN}/agent.json` : `${API_ORIGIN}/catalog.json`
    })),
    independentSellerCount: 1, matchingFeeAtomic: '0', paymentAuthorized: false,
    note: 'Six service capabilities from one operator. Discovery does not establish buyer demand or revenue.'
  };
}

function demandInput(input, now) {
  object(input, ['requestId', 'intent', 'maxPriceUsdc', 'expiresAt', 'localSolutionSufficient', 'requiredCapabilities', 'artifact'], 'INVALID_DEMAND');
  check(Buffer.byteLength(canonicalJson(input)) <= 4096, 'DEMAND_TOO_LARGE');
  check(typeof input.requestId === 'string' && ID.test(input.requestId), 'INVALID_REQUEST_ID');
  check(typeof input.intent === 'string' && Object.hasOwn(DEFINITIONS, input.intent), 'UNSUPPORTED_INTENT');
  usdcAtomic(input.maxPriceUsdc);
  check(typeof input.localSolutionSufficient === 'boolean', 'LOCAL_ALTERNATIVE_REVIEW_REQUIRED');
  const expiry = Date.parse(input.expiresAt);
  check(typeof input.expiresAt === 'string' && /^\d{4}-\d\d-\d\dT/.test(input.expiresAt) && /Z$/.test(input.expiresAt) && Number.isFinite(expiry), 'INVALID_DEADLINE');
  check(expiry - now <= 86400000, 'DEADLINE_TOO_FAR');
  check(input.requiredCapabilities === undefined || (Array.isArray(input.requiredCapabilities) && input.requiredCapabilities.length <= 8 &&
    input.requiredCapabilities.every(item => typeof item === 'string' && /^[a-z][a-z0-9_]{0,79}$/.test(item))), 'INVALID_CAPABILITIES');
  if (input.artifact !== undefined) {
    object(input.artifact, ['sha256', 'mediaType', 'byteLength'], 'INVALID_ARTIFACT_DESCRIPTOR');
    check(input.intent === 'artifact-receipt' && typeof input.artifact.sha256 === 'string' && DIGEST.test(input.artifact.sha256) && input.artifact.mediaType === 'application/json' &&
      Number.isSafeInteger(input.artifact.byteLength) && input.artifact.byteLength >= 2 && input.artifact.byteLength <= 65536, 'INVALID_ARTIFACT_DESCRIPTOR');
  }
  if (input.intent === 'artifact-receipt' && !input.localSolutionSufficient) check(input.artifact !== undefined, 'ARTIFACT_DESCRIPTOR_REQUIRED');
  return clone(input);
}

// Only these explicit, free discovery resources are reachable. No arbitrary URL
// from a demand, catalog, schema, feed, or Bazaar result is ever fetched.
function discoveryTransport(fetchImpl) {
  return async (url, body) => {
    const allowed = [`${API_ORIGIN}/match`, `${API_ORIGIN}/openapi.json`, `${API_ORIGIN}/fix-error/preview`];
    check(allowed.includes(url) || (url.startsWith(`${BAZAAR_SEARCH}?`) && body === undefined), 'DISCOVERY_URL_REFUSED');
    check(body === undefined || url === `${API_ORIGIN}/match`, 'DISCOVERY_WRITE_REFUSED');
    let response;
    try {
      response = await fetchImpl(url, {
        method: body === undefined ? 'GET' : 'POST', redirect: 'error', credentials: 'omit',
        signal: AbortSignal.timeout(15000), cache: 'no-store',
        headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
    } catch { throw new MatchmakerError('DISCOVERY_UNREACHABLE'); }
    check(response.status === 200 && !response.redirected, 'DISCOVERY_UNAVAILABLE');
    check(!response.headers.get('content-length') || Number(response.headers.get('content-length')) <= 524288, 'DISCOVERY_TOO_LARGE');
    const reader = response.body?.getReader(); check(reader, 'INVALID_DISCOVERY_BODY');
    let size = 0; const parts = [];
    try {
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.length;
        if (size > 524288) { await reader.cancel(); throw new MatchmakerError('DISCOVERY_TOO_LARGE'); }
        parts.push(value);
      }
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts)));
    } catch (error) { throw error instanceof MatchmakerError ? error : new MatchmakerError('INVALID_DISCOVERY_JSON'); }
  };
}

function fixErrorSample(data, candidate, matchId, checkedAt, expiresAt) {
  const source = `${API_ORIGIN}/fix-error/preview`;
  check(data?.service === 'Agent Error Fix Receipt' && data.mode === 'mainnet' && data.payment === 'x402' &&
    data.network === NETWORK && data.paid_endpoint === '/fix-error' && typeof data.version === 'string' && data.version.length > 0,
  'FREE_SAMPLE_SCOPE_MISMATCH');
  check(typeof data.price === 'string' && data.price.startsWith('$') &&
    usdcAtomic(data.price.slice(1)) === candidate.amountAtomic, 'FREE_SAMPLE_PRICE_MISMATCH');
  const input = data.request_examples?.missing_dependency?.value;
  object(input, ['command', 'error', 'environment'], 'INVALID_FREE_SAMPLE');
  check([input.command, input.error, input.environment].every(value => typeof value === 'string' && value.length > 0 && value.length <= 4096),
    'INVALID_FREE_SAMPLE');
  const output = data.response_examples?.successful_diagnosis?.value;
  const receipt = output?.receipt;
  object(receipt, ['root_cause', 'next_command', 'retry_plan', 'risk_note', 'prevention_note', 'generated_at'], 'INVALID_FREE_SAMPLE');
  check(output.status === 'paid' && output.network === NETWORK &&
    [receipt.root_cause, receipt.next_command, receipt.risk_note, receipt.prevention_note].every(value =>
      typeof value === 'string' && value.length > 0 && value.length <= 8192) &&
    Array.isArray(receipt.retry_plan) && receipt.retry_plan.length > 0 && receipt.retry_plan.length <= 16 &&
    receipt.retry_plan.every(value => typeof value === 'string' && value.length > 0 && value.length <= 2048) &&
    typeof receipt.generated_at === 'string' && Number.isFinite(Date.parse(receipt.generated_at)), 'INVALID_FREE_SAMPLE');
  return {
    schemaVersion: 'hyperxosist/offer-sample-inspection/1.0', state: 'seller_sample_verified',
    matchId, offerId: candidate.offerId, source, sourceVersion: data.version, checkedAt, expiresAt,
    termsBound: { resource: candidate.resource, amountAtomic: candidate.amountAtomic, network: candidate.network,
      asset: candidate.asset, payTo: candidate.payTo },
    sample: { kind: 'seller_provided_fixed_example', input: clone(input), output: { status: output.status, receipt: clone(receipt) } },
    caveats: ['FIXED_EXAMPLE_NOT_BUYER_TASK', 'SELLER_SAMPLE_NOT_INDEPENDENT_OUTCOME_EVIDENCE', 'PAID_EXECUTION_UNVERIFIED'],
    next: { action: 'host_compare_sample_to_actual_need', automaticPurchase: false, paymentAuthorizationRequired: true },
    purchaseExecuted: false, paymentAuthorized: false, deliveryVerified: false, outcomeVerified: false, revenueClaimed: false
  };
}

function apiCandidate(offer, api, demand) {
  const d = DEFINITIONS[demand.intent]; const resource = `${API_ORIGIN}${d.path}`;
  const operation = api?.paths?.[d.path]?.post;
  const payment = operation?.['x-payment-info'];
  const price = offer?.price;
  check(offer?.intent === demand.intent && offer.id === d.path.slice(1) && offer.endpoint === resource && offer.method === 'POST', 'OFFER_SCOPE_MISMATCH');
  check(price?.currency === 'USDC' && price.network === NETWORK && price.mode === 'mainnet' &&
    typeof price.atomic_amount === 'string' && ATOMIC.test(price.atomic_amount) && BigInt(price.atomic_amount) > 0n &&
    usdcAtomic(price.amount) === price.atomic_amount, 'OFFER_PRICE_INVALID');
  check(offer.payment?.protocol === 'x402' && offer.payment.version === 2 && offer.payment.authorization_required === true &&
    addressEqual(offer.payment.recipient, SELLER_ADDRESS), 'OFFER_PAYMENT_MISMATCH');
  check(payment?.protocol === 'x402' && payment.version === 2 && payment.scheme === 'exact' && payment.network === NETWORK &&
    payment.currency === 'USDC' && addressEqual(payment.payTo, SELLER_ADDRESS) && payment.expected_unpaid_response === 402 &&
    payment.expected_paid_response === 200 && typeof payment.price === 'string' && payment.price.startsWith('$') &&
    usdcAtomic(payment.price.slice(1)) === price.atomic_amount &&
    addressEqual(payment.bazaar_indexing?.asset_contract, USDC), 'OPENAPI_TERMS_MISMATCH');
  const requestSchema = operation?.requestBody?.content?.['application/json']?.schema;
  check(requestSchema?.type === 'object' && Buffer.byteLength(canonicalJson(requestSchema)) <= 32768, 'INPUT_SCHEMA_UNAVAILABLE');
  return {
    offerId: offer.id, sellerOperatorId: OPERATOR, intent: demand.intent, capability: d.capability,
    delivers: d.delivers, limitation: d.limitation,
    resource, method: 'POST', amountAtomic: price.atomic_amount, network: NETWORK, asset: USDC, payTo: SELLER_ADDRESS,
    readiness: 'discovery_consistent_execution_unverified',
    next: {
      action: 'review_live_challenge_with_host_wallet',
      inputSchema: clone(requestSchema), exampleRequest: clone(d.example),
      ...(demand.intent === 'x-search' ? { localTool: 'hyperxosist_execute' } : {}),
      paymentAuthorizationRequired: true, automaticPurchase: false
    }
  };
}

/** Agent-side matching, with buyer identity supplied by the host, never a model. */
export function createAgentMatchmaker({ fetchImpl = fetch, now = Date.now, buyerOperatorId = null, buyerAddress = null, allowBazaar = false } = {}) {
  check(buyerOperatorId === null || (typeof buyerOperatorId === 'string' && ID.test(buyerOperatorId)), 'INVALID_BUYER_CONTEXT');
  check(buyerAddress === null || (typeof buyerAddress === 'string' && ADDRESS.test(buyerAddress)), 'INVALID_BUYER_CONTEXT');
  check(typeof allowBazaar === 'boolean', 'INVALID_DISCOVERY_POLICY');
  const http = discoveryTransport(fetchImpl);
  const buyer = createAVUBuyer({ fetchImpl, now });
  const sessions = new Map();
  const counts = { demands: 0, reviews: 0, skipped: 0, blocked: 0, sampleInspections: 0, receiptPreparations: 0 };
  const self = buyerOperatorId?.toLowerCase() === OPERATOR || addressEqual(buyerAddress, SELLER_ADDRESS);
  const identity = buyerOperatorId === null ? 'buyer_operator_unknown' : 'host_supplied_not_independently_verified';

  async function evaluate(demand) {
    const definition = DEFINITIONS[demand.intent];
    const requestDigest = canonicalDigest(demand);
    const reply = (decision, reasons, candidates = []) => {
      counts[decision === 'review' ? 'reviews' : decision === 'skip' ? 'skipped' : 'blocked']++;
      const payload = {
        schemaVersion: 'hyperxosist/agent-match/1.0', requestId: demand.requestId, requestDigest,
        decision, reasons, candidates, checkedAt: new Date(now()).toISOString(),
        expiresAt: new Date(Math.min(Date.parse(demand.expiresAt), now() + 60000)).toISOString(),
        freeAlternative: { description: definition.freeAlternative,
          url: `${demand.intent === 'artifact-receipt' ? AVU_ORIGIN : API_ORIGIN}${definition.freePath}` },
        buyerIdentity: identity, purchaseExecuted: false, paymentAuthorized: false, revenueClaimed: false,
        matchingFeeAtomic: '0'
      };
      return { ...payload, matchId: canonicalDigest(payload) };
    };
    if (Date.parse(demand.expiresAt) <= now()) return reply('blocked', ['DEMAND_EXPIRED']);
    if (demand.localSolutionSufficient) return reply('skip', ['LOCAL_SOLUTION_SUFFICIENT']);
    if ((demand.requiredCapabilities || []).some(c => c !== definition.capability)) return reply('skip', ['REQUIRED_CAPABILITY_UNSUPPORTED']);
    if (BigInt(usdcAtomic(demand.maxPriceUsdc)) === 0n) return reply('skip', ['ZERO_PAID_BUDGET']);
    if (self) return reply('skip', ['SAME_OPERATOR_OR_RECIPIENT']);
    try {
      let candidates;
      if (demand.intent === 'artifact-receipt') {
        const status = await buyer.inspect();
        if (!status.available) return reply('blocked', status.reasons);
        const price = status.manifest.payment;
        check(price?.network === NETWORK && addressEqual(price.asset, USDC) && price.symbol === 'USDC' && price.decimals === 6 &&
          typeof price.amount === 'string' && ATOMIC.test(price.amount) && BigInt(price.amount) > 0n, 'OFFER_PAYMENT_MISMATCH');
        candidates = [{
          offerId: 'agent-verification-utility', sellerOperatorId: OPERATOR, intent: demand.intent, capability: definition.capability,
          delivers: definition.delivers, limitation: definition.limitation,
          resource: `${AVU_ORIGIN}/verify-evidence`, method: 'POST', amountAtomic: price.amount,
          network: NETWORK, asset: USDC, payTo: SELLER_ADDRESS, readiness: 'ready_for_free_precheck',
          next: { action: 'prepare_receipt_with_host_upload_permission', module: 'agent-matchmaker.mjs',
            method: 'prepareReceipt', recipientConfirmedBy: 'host_pin_then_free_precheck', paymentAuthorizationRequired: true, automaticPurchase: false }
        }];
      } else {
        // Only the category and price leave the process; no logs, artifact, goal
        // prose, buyer identity, request ID, signatures, or task input is uploaded.
        const [matches, api] = await Promise.all([
          http(`${API_ORIGIN}/match`, { intent: demand.intent, max_price_usdc: demand.maxPriceUsdc,
            network: NETWORK, prefer_free: false, local_solution_sufficient: false }),
          http(`${API_ORIGIN}/openapi.json`)
        ]);
        check(matches?.schema_version === '1.0' && ['review', 'skip'].includes(matches.decision) && matches.purchase_executed === false &&
          matches.payment_authorized === false && Array.isArray(matches.matches) && matches.matches.length <= 3, 'INVALID_MATCH_RESPONSE');
        if (matches.decision === 'skip') {
          check(matches.matches.length === 0, 'INVALID_MATCH_RESPONSE');
          return reply('skip', ['SELLER_HAS_NO_MATCH']);
        }
        candidates = matches.matches.map(offer => apiCandidate(offer, api, demand));
        check(new Set(candidates.map(c => c.resource)).size === candidates.length, 'DUPLICATE_OFFER');
      }
      check(Date.parse(demand.expiresAt) > now(), 'DEMAND_EXPIRED');
      candidates = candidates.filter(c => BigInt(c.amountAtomic) <= BigInt(usdcAtomic(demand.maxPriceUsdc)));
      candidates.sort((a, b) => BigInt(a.amountAtomic) < BigInt(b.amountAtomic) ? -1 : BigInt(a.amountAtomic) > BigInt(b.amountAtomic) ? 1 : a.offerId.localeCompare(b.offerId));
      return candidates.length ? reply('review', ['CAPABILITY_AND_ADVERTISED_TERMS_MATCH'], candidates) : reply('skip', ['NO_OFFER_WITHIN_BUDGET']);
    } catch (error) { return reply('blocked', [safeCode(error)]); }
  }

  return {
    listOffers: listAgentOffers,
    diagnostics: () => ({ ...counts, purchaseExecuted: false, revenueClaimed: false }),
    async match(input) {
      const demand = demandInput(input, now());
      const digest = canonicalDigest(demand);
      for (const [id, entry] of sessions) if (!entry.pending && Date.parse(entry.demand.expiresAt) <= now()) sessions.delete(id);
      let entry = sessions.get(demand.requestId);
      check(!entry || entry.digest === digest, 'REQUEST_ID_REUSED_WITH_DIFFERENT_DEMAND');
      if (entry?.pending) return clone(await entry.pending);
      if (entry?.result && Date.parse(entry.result.expiresAt) > now()) return clone(entry.result);
      check(entry || sessions.size < 256, 'TOO_MANY_ACTIVE_DEMANDS');
      if (!entry) {
        entry = { digest, demand }; sessions.set(demand.requestId, entry); counts.demands++;
      }
      entry.pending = evaluate(demand);
      try { entry.result = await entry.pending; return clone(entry.result); }
      finally { entry.pending = null; }
    },
    async inspectFreeSample(matchId) {
      check(typeof matchId === 'string' && DIGEST.test(matchId), 'INVALID_MATCH_ID');
      const entry = [...sessions.values()].find(e => e.result?.matchId === matchId);
      check(entry?.result.decision === 'review' && Date.parse(entry.result.expiresAt) > now(), 'FRESH_MATCH_REQUIRED');
      check(entry.demand.intent === 'command-error', 'FREE_SAMPLE_INSPECTION_UNAVAILABLE');
      if (entry.samplePending) return clone(await entry.samplePending);
      if (entry.sampleResult && Date.parse(entry.sampleResult.expiresAt) > now()) return clone(entry.sampleResult);
      entry.samplePending = (async () => {
        const candidate = entry.result.candidates.find(item => item.offerId === 'fix-error');
        check(candidate && candidate.resource === `${API_ORIGIN}/fix-error`, 'FREE_SAMPLE_SCOPE_MISMATCH');
        const data = await http(`${API_ORIGIN}/fix-error/preview`);
        check(Date.parse(entry.result.expiresAt) > now(), 'FRESH_MATCH_REQUIRED');
        const checkedAt = new Date(now()).toISOString();
        const result = fixErrorSample(data, candidate, matchId, checkedAt, entry.result.expiresAt);
        counts.sampleInspections++;
        return result;
      })();
      try { entry.sampleResult = await entry.samplePending; return clone(entry.sampleResult); }
      finally { entry.samplePending = null; }
    },
    async prepareReceipt(matchId, options) {
      const entry = [...sessions.values()].find(e => e.result?.matchId === matchId);
      check(entry?.result.decision === 'review' && entry.demand.intent === 'artifact-receipt' &&
        Date.parse(entry.result.expiresAt) > now(), 'FRESH_RECEIPT_MATCH_REQUIRED');
      check(!entry.preparing && !entry.prepared, 'RECEIPT_PREPARATION_ALREADY_STARTED');
      object(options, ['jsonText', 'expectedSha256', 'allowEvidenceUpload', 'spendPolicy', 'idempotencyKey'], 'INVALID_PREPARATION_OPTIONS');
      check(typeof options.jsonText === 'string' && options.expectedSha256 === entry.demand.artifact.sha256 &&
        Buffer.byteLength(options.jsonText) === entry.demand.artifact.byteLength, 'MATCH_ARTIFACT_MISMATCH');
      const policy = options.spendPolicy;
      check(policy?.policy_version === AVU_POLICY_VERSION && typeof policy.max_amount_atomic === 'string' && ATOMIC.test(policy.max_amount_atomic) &&
        BigInt(policy.max_amount_atomic) <= BigInt(usdcAtomic(entry.demand.maxPriceUsdc)) && policy.network === NETWORK &&
        addressEqual(policy.asset, USDC) && addressEqual(policy.pay_to, SELLER_ADDRESS), 'HOST_SPEND_POLICY_MISMATCH');
      entry.preparing = true;
      try {
        const handle = await buyer.prepare({ ...options, clientRequestId: entry.demand.requestId, requiresSignedReceipt: true });
        if (handle.state !== 'prepared') return handle;
        check(Date.parse(entry.demand.expiresAt) > now(), 'DEMAND_EXPIRED');
        entry.prepared = true; counts.receiptPreparations++;
        // The host keeps this object. It is deliberately not an MCP payment tool.
        return { state: 'prepared', matchId, buyer, handle, paymentAuthorized: false, quoteCreated: false };
      } finally { entry.preparing = false; }
    },
    async discover(input) {
      check(allowBazaar, 'EXTERNAL_DISCOVERY_NOT_ENABLED_BY_HOST');
      object(input, ['query', 'maxPriceUsdc'], 'INVALID_DISCOVERY_QUERY');
      check(typeof input.query === 'string' && input.query.trim().length > 0 && input.query.length <= 400, 'INVALID_DISCOVERY_QUERY');
      const budget = usdcAtomic(input.maxPriceUsdc);
      const url = new URL(BAZAAR_SEARCH);
      for (const [k, v] of Object.entries({ query: input.query.trim(), maxUsdPrice: input.maxPriceUsdc, network: NETWORK, asset: USDC, scheme: 'exact', limit: '20' })) url.searchParams.set(k, v);
      let data;
      try { data = await http(url.href); } catch (error) { return { state: 'unavailable', reason: safeCode(error), candidates: [], paymentAuthorized: false }; }
      check(data?.x402Version === 2 && Array.isArray(data.resources) && data.resources.length <= 20 && typeof data.partialResults === 'boolean', 'INVALID_BAZAAR_RESPONSE');
      const candidates = [];
      for (const item of data.resources) {
        if (item?.type !== 'http' || item.x402Version !== 2 || !Array.isArray(item.accepts) || item.accepts.length > 20) continue;
        let resource; try { resource = new URL(item.resource); } catch { continue; }
        if (resource.protocol !== 'https:' || resource.username || resource.password || resource.hash || resource.port ||
          !/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(resource.hostname) || /\.(?:localhost|local|internal|test|invalid)$/i.test(resource.hostname)) continue;
        const terms = item.accepts.filter(t => t?.scheme === 'exact' && t.network === NETWORK && addressEqual(t.asset, USDC) &&
          typeof t.amount === 'string' && ATOMIC.test(t.amount) && BigInt(t.amount) > 0n && BigInt(t.amount) <= BigInt(budget) &&
          ADDRESS.test(t.payTo) && !/^0x0{40}$/i.test(t.payTo) && !addressEqual(t.payTo, buyerAddress));
        if (!terms.length || (self && terms.some(t => addressEqual(t.payTo, SELLER_ADDRESS)))) continue;
        candidates.push({ resource: resource.href, advertisedTerms: terms.map(t => ({ amountAtomic: t.amount, network: NETWORK, asset: USDC, payTo: t.payTo })),
          trust: 'unreviewed_directory_entry', automaticPurchaseEligible: false,
          nextAction: 'Host must review capability, ownership, live terms and an execution adapter before adding this service.' });
      }
      return { state: 'discovered', source: BAZAAR_SEARCH, partialResults: data.partialResults,
        candidates, paymentAuthorized: false, purchaseExecuted: false, revenueClaimed: false };
    }
  };
}
