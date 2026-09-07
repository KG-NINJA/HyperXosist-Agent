import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

// No wallet, credentials, paid retry, arbitrary URL, deployment or DB mutation.
export const RESOURCE = 'https://api.kgninja.dev/fix-error';
export const URLS = Object.freeze({
  openapi: 'https://api.kgninja.dev/openapi.json',
  options: 'https://api.kgninja.dev/payment-options.json',
  preview: 'https://api.kgninja.dev/fix-error/preview',
  discovery: 'https://api.kgninja.dev/.well-known/x402/discovery/resources',
  integrity: 'https://api.kgninja.dev/revenue-log/integrity',
  challenge: RESOURCE,
  validator: 'https://api.cdp.coinbase.com/platform/v2/x402/validate'
});
const SAMPLE = Object.freeze({command: 'npm run build', error: "Error: Cannot find module 'hono'", environment: 'Synthetic unpaid readiness probe; not a customer'});
const FIELDS = ['root_cause', 'next_command', 'retry_plan', 'risk_note', 'prevention_note', 'generated_at'];
const INPUT_FIELDS = ['command', 'error', 'log', 'environment'];
const POLICY = Object.freeze({network: 'eip155:8453', asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', payTo: '0x4D7d842536De9Eb491AE2300126B3CDdE7B0aDE3', amount: '10000'});
const MAX_BYTES = 1048576;
const digest = data => 'sha256:' + createHash('sha256').update(JSON.stringify(data)).digest('hex');
const sameAddress = (a, b) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase();
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => isRecord(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|');

export function decodeChallenge(header) {
  if (typeof header !== 'string' || !header || header.length > 65536 || !/^[A-Za-z0-9+/]+={0,2}$/.test(header)) throw new Error('INVALID_PAYMENT_REQUIRED');
  const bytes = Buffer.from(header, 'base64');
  if (bytes.toString('base64').replace(/=+$/, '') !== header.replace(/=+$/, '')) throw new Error('INVALID_PAYMENT_REQUIRED');
  return JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes));
}
export function validTerms(terms) {
  return isRecord(terms) && terms.scheme === 'exact' && terms.network === POLICY.network &&
    sameAddress(terms.asset, POLICY.asset) && sameAddress(terms.payTo, POLICY.payTo) && terms.amount === POLICY.amount &&
    Number.isSafeInteger(terms.maxTimeoutSeconds) && terms.maxTimeoutSeconds > 0;
}
export function receiptShape(value) {
  return exactKeys(value, FIELDS) && FIELDS.filter(k => k !== 'retry_plan').every(k => typeof value[k] === 'string') &&
    Array.isArray(value.retry_plan) && value.retry_plan.every(x => typeof x === 'string') && Number.isFinite(Date.parse(value.generated_at));
}

/** Builds review-only SDK options from the current OpenAPI, never a replacement server. */
export function projectDiscovery(api, recipe) {
  const op = api?.paths?.['/fix-error']?.post;
  const input = op?.requestBody?.content?.['application/json'];
  const output = op?.responses?.['200']?.content?.['application/json'];
  const terms = op?.['x-payment-info'];
  if (!input?.schema || !output?.schema || !isRecord(input.example) || !receiptShape(output.example)) throw new Error('OPENAPI_EXAMPLES_OR_SCHEMAS_MISSING');
  if (input.schema.type !== 'object' || !exactKeys(input.schema.properties, INPUT_FIELDS) || input.schema.additionalProperties !== false ||
    output.schema.type !== 'object' || !exactKeys(output.schema.properties, FIELDS) ||
    !Array.isArray(output.schema.required) || [...output.schema.required].sort().join('|') !== [...FIELDS].sort().join('|')) throw new Error('OPENAPI_CONTRACT_CHANGED');
  if (terms?.protocol !== 'x402' || terms?.version !== 2 || terms?.scheme !== 'exact' || terms?.price !== '$0.01' ||
    terms.network !== POLICY.network || !sameAddress(terms.payTo, POLICY.payTo) ||
    !sameAddress(terms?.bazaar_indexing?.asset_contract, POLICY.asset)) throw new Error('OPENAPI_TERMS_CHANGED');
  if (recipe.resource !== RESOURCE || recipe.method !== 'POST' || typeof recipe.description !== 'string' || recipe.description.length > 500 || !recipe.description.trim()) throw new Error('RECIPE_SCOPE_CHANGED');
  return {
    schema_version: 'hyperxosist/discovery-projection/1.0', application: 'review_only_not_deployed',
    resource: RESOURCE, method: 'POST', source: URLS.openapi, source_sha256: digest(api),
    description: recipe.description,
    sdk: 'Installed @x402/extensions/bazaar declareDiscoveryExtension; verify installed version before integration',
    options: {method: 'POST', bodyType: 'json', input: input.example, inputSchema: input.schema, output: {example: output.example, schema: output.schema}},
    invariants: {price: '$0.01', ...POLICY, payment_logic_unchanged: true, server_identity_required: true}
  };
}

// Transport returns a bounded local snapshot. Raw bodies are never printed or written by the CLI.
export async function collect({fetchImpl = fetch, validate = false} = {}) {
  const observations = {};
  await Promise.all(Object.entries(URLS).filter(([key]) => key !== 'validator' || validate).map(async ([key, url]) => {
    const post = key === 'challenge' || key === 'validator';
    const body = key === 'challenge' ? SAMPLE : {resource: RESOURCE, method: 'POST'};
    const started = Date.now();
    try {
      const res = await fetchImpl(url, {
        method: post ? 'POST' : 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store',
        signal: AbortSignal.timeout(key === 'validator' ? 30000 : 15000),
        headers: {Accept: 'application/json', 'User-Agent': 'KG-NINJA-readiness-audit/1.0 (synthetic; unpaid)',
          ...(post ? {'Content-Type': 'application/json'} : {}), ...(key === 'challenge' ? {'X-KG-Traffic-Class': 'synthetic_probe'} : {})},
        ...(post ? {body: JSON.stringify(body)} : {})
      });
      if (res.redirected) throw new Error('REDIRECT_REFUSED');
      const length = res.headers.get('content-length');
      if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)) throw new Error('BODY_LIMIT');
      const reader = res.body?.getReader();
      if (!reader) throw new Error('EMPTY_BODY');
      let size = 0; const chunks = [];
      try {
        for (;;) {
          const {value, done} = await reader.read(); if (done) break;
          size += value.length; if (size > MAX_BYTES) { await reader.cancel(); throw new Error('BODY_LIMIT'); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const data = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(Buffer.concat(chunks)));
      observations[key] = {status: res.status, elapsed_ms: Date.now() - started, data,
        ...(key === 'challenge' ? {payment_required: res.headers.get('PAYMENT-REQUIRED')} : {})};
    } catch (error) {
      // Never expose remote exception text, request bodies or credentials.
      observations[key] = {unavailable: true, code: ['BODY_LIMIT', 'REDIRECT_REFUSED', 'EMPTY_BODY'].includes(error.message) ? error.message : 'FETCH_OR_JSON_UNAVAILABLE', elapsed_ms: Date.now() - started};
    }
  }));
  return observations;
}

export function evaluate(observations, recipe, now = new Date().toISOString()) {
  const checks = [];
  const check = (id, state) => checks.push({id, state});
  const known = (key, expected = 200) => {
    const o = observations[key];
    if (!o || o.unavailable || [401,403,429].includes(o.status) || o.status >= 500) { check(key + '_reachable', 'unknown'); return null; }
    check(key + '_http', o.status === expected ? 'pass' : 'fail');
    return o.status === expected ? o.data : null;
  };
  const api = known('openapi'), options = known('options'), preview = known('preview');
  const directory = known('discovery'), integrity = known('integrity'), challengeBody = known('challenge', 402);
  let projection = null, challenge = null;
  if (api) {
    try { projection = projectDiscovery(api, recipe); check('openapi_projection', 'pass'); }
    catch { check('openapi_projection', 'fail'); }
  }
  if (options) check('payment_options_terms', options.network === POLICY.network && options.x402Version === 2 && options.scheme === 'exact' && options.price === '0.01 USDC' && sameAddress(options.assetAddress, POLICY.asset) && sameAddress(options.payTo, POLICY.payTo) ? 'pass' : 'fail');
  if (preview) check('free_preview_available', 'pass');
  if (directory) {
    const entry = directory.resources?.find(x => x.resource === RESOURCE);
    check('public_directory_terms', entry?.x402Version === 2 && Array.isArray(entry.accepts) && entry.accepts.length === 1 && validTerms(entry.accepts[0]) ? 'pass' : 'fail');
    check('public_directory_receipt_example', receiptShape(entry?.metadata?.output?.example) ? 'pass' : 'warning');
  }
  if (challengeBody) {
    try { challenge = decodeChallenge(observations.challenge.payment_required); }
    catch { check('challenge_decode', 'fail'); }
    if (challenge) {
      check('challenge_terms', challenge.x402Version === 2 && challenge.resource?.url === RESOURCE && Array.isArray(challenge.accepts) && challenge.accepts.length === 1 && validTerms(challenge.accepts[0]) ? 'pass' : 'fail');
      const echoed = challengeBody.payment_required ?? (challengeBody.x402Version === 2 && isRecord(challengeBody.resource) ? challengeBody : null);
      const comparable = x => ({x402Version:x.x402Version, resource:x.resource, accepts:x.accepts, extensions:x.extensions});
      // Equality independent of JSON object key ordering.
      const canonical = x => Array.isArray(x) ? x.map(canonical) : isRecord(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, canonical(x[k])])) : x;
      check('challenge_header_body', echoed ? JSON.stringify(canonical(comparable(echoed))) === JSON.stringify(canonical(comparable(challenge))) ? 'pass' : 'fail' : 'unknown');
      const bazaar = challenge.extensions?.bazaar;
      check('challenge_bazaar_present', isRecord(bazaar?.info) && isRecord(bazaar?.schema) ? 'pass' : 'fail');
      const input = bazaar?.info?.input;
      check('challenge_input_example', input?.type === 'http' && input.method === 'POST' && input.bodyType === 'json' && isRecord(input.body) && Object.keys(input.body).some(k => INPUT_FIELDS.includes(k) && typeof input.body[k] === 'string' && input.body[k].trim()) ? 'pass' : 'warning');
      check('challenge_receipt_example', receiptShape(bazaar?.info?.output?.example) ? 'pass' : 'warning');
      const description = challenge.resource?.description;
      check('challenge_description_limit', typeof description === 'string' && description.length > 0 && description.length <= 500 ? 'pass' : 'fail');
      check('challenge_description_useful', typeof description === 'string' && description.length >= 80 ? 'pass' : 'warning');
    }
  }
  const validation = known('validator');
  let index = null;
  if (validation) {
    const valid = validation.valid === true && validation.statusCode === 402 && validation.x402Version === 2 && validation.simulation?.outcome === 'accepted' && Array.isArray(validation.preflight) && validation.preflight.length > 0 && validation.preflight.every(x => x.severity !== 'required' || x.passed === true);
    check('official_validation', valid ? 'pass' : 'fail');
    if (validation.index) {
      index = {active: validation.index.active === true,
        calls_30d: Number.isSafeInteger(validation.index.quality?.l30DaysTotalCalls) ? validation.index.quality.l30DaysTotalCalls : null,
        payers_30d: Number.isSafeInteger(validation.index.quality?.l30DaysUniquePayers) ? validation.index.quality.l30DaysUniquePayers : null};
      check('bazaar_index_active', index.active ? 'pass' : 'warning');
    } else check('bazaar_index_active', 'unknown');
  }
  const failed = checks.filter(x => x.state === 'fail').map(x => x.id);
  const incomplete = checks.filter(x => ['unknown','warning'].includes(x.state)).map(x => x.id);
  return {
    schema_version: 'hyperxosist/fix-error-readiness/1.0', checked_at: now, resource: RESOURCE,
    state: failed.length ? 'blocked' : incomplete.length ? 'partial' : 'unpaid_checks_passed', checks,
    safety: {synthetic_probe: true, payment_authorized: false, payment_sent: false, wallet_accessed: false, deployment_performed: false, sales_generated: false},
    boundaries: {live_paid_delivery_tested: false, buyer_identity_verified: false, new_external_sales_proven: false, worker_deployment_identity_verified: false},
    observations: Object.fromEntries(Object.entries(observations).map(([key, o]) => [key, {url: URLS[key], status: o?.status ?? null, unavailable: !o || o.unavailable === true, ...(o?.data ? {body_sha256:digest(o.data)} : {})}])),
    source_reported_revenue: integrity ? {matched: Number.isSafeInteger(integrity.matched) ? integrity.matched : null, amount: typeof integrity.confirmed_amount === 'string' && /^\d+(?:\.\d+)?$/.test(integrity.confirmed_amount) ? integrity.confirmed_amount : null, attribution: 'seller_aggregate_not_independently_verified'} : null,
    bazaar_index: index, failed_checks: failed, incomplete_checks: incomplete,
    next_action: failed.length ? 'Resolve exact failed checks before paid promotion; do not weaken payment controls.' : incomplete.length ? 'Inspect incomplete checks; keep unavailable or missing evidence unknown.' : 'Discovery validated without payment. Measure real independent paid deliveries; no sale has been created by this audit.',
    projection
  };
}

export async function main(argv = process.argv.slice(2)) {
  const allowed = new Set(['--live', '--validate', '--out']);
  let out = null;
  for (let i = 0; i < argv.length; i++) {
    if (!allowed.has(argv[i])) throw new Error('UNKNOWN_ARGUMENT');
    if (argv[i] === '--out') { if (!argv[i+1] || argv[i+1].startsWith('--')) throw new Error('OUTPUT_PATH_REQUIRED'); out = argv[++i]; }
  }
  if (!argv.includes('--live')) throw new Error('EXPLICIT_LIVE_FLAG_REQUIRED');
  const recipe = JSON.parse(await readFile(new URL('../fix-error-quickstart.json', import.meta.url), 'utf8'));
  const report = evaluate(await collect({validate: argv.includes('--validate')}), recipe);
  const json = JSON.stringify(report, null, 2) + '\n';
  if (out) { await mkdir(dirname(resolve(out)), {recursive:true}); await writeFile(resolve(out), json, {mode:0o600}); }
  process.stdout.write(json);
  // Partial is not success. The workflow may publish evidence without treating it as a paid-flow result.
  return report.state === 'blocked' ? 1 : report.state === 'partial' ? 2 : 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then(code => {process.exitCode = code;}).catch(() => {console.error('READINESS_AUDIT_FAILED: use --live [--validate] [--out path]; no payment performed.'); process.exitCode = 3;});
}
