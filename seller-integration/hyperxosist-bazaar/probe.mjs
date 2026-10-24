import { writeFile } from 'node:fs/promises';
import { RESOURCE, INPUT_EXAMPLE } from './route.mjs';

// Two fixed unsigned requests only; no signer, credentials, paid retry or arbitrary URL.
if (!process.argv.includes('--live')) throw new Error('EXPLICIT_LIVE_OPT_IN_REQUIRED');
const validatorUrl = 'https://api.cdp.coinbase.com/platform/v2/x402/validate';
async function post(url, body) {
  try {
    const response = await fetch(url, {
      method: 'POST', redirect: 'error', credentials: 'omit', cache: 'no-store',
      signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json',
        'User-Agent': 'KG-NINJA-bazaar-repair-probe/1.0 (synthetic; unsigned)',
        'X-KG-Traffic-Class': 'synthetic_probe' },
      body: JSON.stringify(body),
    });
    if (response.redirected) throw new Error('REDIRECT_REFUSED');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('EMPTY_BODY');
    const chunks = []; let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.length;
        if (size > 262144) { await reader.cancel(); throw new Error('BODY_LIMIT'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return { status: response.status, data, header: response.headers.get('PAYMENT-REQUIRED') };
  } catch { return { status: null, unavailable: true }; }
}
const raw = await post(RESOURCE, INPUT_EXAMPLE);
const official = await post(validatorUrl, { resource: RESOURCE, method: 'POST' });
let challenge = null;
try {
  if (typeof raw.header !== 'string' || raw.header.length > 65536) throw new Error('HEADER');
  challenge = JSON.parse(Buffer.from(raw.header, 'base64').toString('utf8'));
} catch {}
const terms = challenge?.accepts;
const t = Array.isArray(terms) && terms.length === 1 ? terms[0] : null;
const correctTerms = raw.status === 402 && challenge?.x402Version === 2 && challenge.resource?.url === RESOURCE &&
  t?.scheme === 'exact' && t.network === 'eip155:8453' && t.amount === '10000' &&
  t.asset?.toLowerCase() === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' &&
  t.payTo?.toLowerCase() === '0x4d7d842536de9eb491ae2300126b3cdde7b0ade3';
const b = challenge?.extensions?.bazaar;
const present = !!(b && typeof b === 'object' && b.info && b.schema);
const v = official.data;
const requiredPassed = Array.isArray(v?.preflight) && v.preflight.length > 0 &&
  v.preflight.every(x => x && (x.severity !== 'required' || x.passed === true));
const report = {
  checked_at: new Date().toISOString(), resource: RESOURCE,
  http_status: raw.status, pinned_payment_terms_match: !!correctTerms,
  bazaar_present_in_actual_402: raw.unavailable || !challenge ? null : present,
  official_validation: official.unavailable ? 'unknown' : v?.valid === false ? 'rejected' :
    v?.valid === true && v.statusCode === 402 && v.x402Version === 2 &&
    v.simulation?.outcome === 'accepted' && requiredPassed ? 'accepted' : 'unknown',
  required_failures: Array.isArray(v?.preflight) ? v.preflight
    .filter(x => x?.severity === 'required' && x.passed !== true)
    .map(x => typeof x.check === 'string' && /^[A-Za-z0-9_.\[\]-]{1,100}$/.test(x.check) ? x.check : 'unrecognized_check') : [],
  production_deployment_performed: false, real_payment_performed: false,
  boundary: 'Live observation only. Local SDK test success is not a production deployment or a paid delivery.',
};
await writeFile(new URL('./live-probe.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
