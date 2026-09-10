#!/usr/bin/env node
/** Read-only AVU discovery audit. Never signs, posts, settles, or authorizes payment. */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const BASELINE = Object.freeze({
  origin: 'https://agent-economy.kgninja.dev',
  observedOn: '2026-09-10',
  scheme: 'exact', network: 'eip155:8453', amount: '10000',
  asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  payTo: '0x4D7d842536De9Eb491AE2300126B3CDdE7B0aDE3',
  policyVersion: 'agent-economy/precheck-policy/2.0'
});
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const addressEqual = (a, b) => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a)
  && a.toLowerCase() === b.toLowerCase();

export function auditManifest(manifest) {
  const findings = [];
  const fail = (path, expected, actual) => findings.push({ path, expected, actual: actual ?? null });
  const eq = (path, actual, expected, isAddress = false) => {
    if (!(isAddress ? addressEqual(actual, expected) : actual === expected)) fail(path, expected, actual);
  };
  eq('x402Version', manifest?.x402Version, 2);
  eq('payment_mode', manifest?.payment_mode, 'x402');
  eq('simulation', manifest?.simulation, false);
  const resources = Array.isArray(manifest?.resources) ? manifest.resources : [];
  for (const suffix of ['/verify-evidence', '/mcp']) {
    const url = BASELINE.origin + suffix;
    const matches = resources.filter(r => r?.resource === url && r?.method === 'POST');
    const p = `resources[${suffix}]`;
    if (matches.length !== 1) { fail(p, 'one POST resource', matches.length); continue; }
    const r = matches[0];
    if (!Array.isArray(r.accepts) || r.accepts.length !== 1) {
      fail(`${p}.accepts`, 'one reviewed exact/Base/USDC offer', r.accepts?.length); continue;
    }
    const a = r.accepts[0];
    for (const k of ['scheme', 'network', 'amount', 'asset', 'payTo'])
      eq(`${p}.accepts[0].${k}`, a[k], BASELINE[k], k === 'asset' || k === 'payTo');
    eq(`${p}.accepts[0].extra.policyVersion`, a.extra?.policyVersion, BASELINE.policyVersion);
    eq(`${p}.accepts[0].extra.precheckRequired`, a.extra?.precheckRequired, true);
    eq(`${p}.accepts[0].extra.bindingRequired`, a.extra?.bindingRequired, true);
    const info = r.extensions?.bazaar?.info;
    const intent = suffix === '/mcp' ? info?.input?.example?.intent : info?.input?.body;
    eq(`${p}.bazaar.input.type`, info?.input?.type, suffix === '/mcp' ? 'mcp' : 'http');
    if (suffix === '/mcp') eq(`${p}.bazaar.toolName`, info?.input?.toolName, 'verify_evidence');
    const policy = intent?.spend_policy;
    if (!object(policy)) fail(`${p}.example.spend_policy`, 'object', policy);
    else {
      eq(`${p}.example.policy_version`, policy.policy_version, BASELINE.policyVersion);
      eq(`${p}.example.network`, policy.network, a.network);
      eq(`${p}.example.asset`, policy.asset, a.asset, true);
      eq(`${p}.example.pay_to`, policy.pay_to, a.payTo, true);
      eq(`${p}.example.max_amount_atomic`, policy.max_amount_atomic, a.amount);
    }
    const binding = info?.output?.example?.receipt?.paid_verification_binding;
    if (!object(binding)) fail(`${p}.output.paid_verification_binding`, 'object', binding);
    else {
      eq(`${p}.output.binding.network`, binding.network, a.network);
      eq(`${p}.output.binding.asset`, binding.asset, a.asset, true);
      eq(`${p}.output.binding.pay_to`, binding.pay_to, a.payTo, true);
      eq(`${p}.output.binding.quoted_amount_atomic`, binding.quoted_amount_atomic, a.amount);
      eq(`${p}.output.binding.price_cap_atomic`, binding.price_cap_atomic, a.amount);
    }
  }
  return { passed: findings.length === 0, findings, scope: 'published_examples_only',
    provesSettlement: false, provesDelivery: false, authorizesPayment: false,
    note: 'Templates are not executable paid intents. Obtain a fresh precheck digest and buyer approval.' };
}

async function getJson(url) {
  const response = await fetch(url, { method: 'GET', redirect: 'error',
    signal: AbortSignal.timeout(15000), headers: { accept: 'application/json', 'cache-control': 'no-cache' } });
  if (!response.ok) throw new Error(`GET ${new URL(url).pathname}: HTTP ${response.status}`);
  const media = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (media !== 'application/json') throw new Error('Unexpected Content-Type');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');
  const chunks = []; let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 1024 * 1024) throw new Error('Response exceeds 1 MiB');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function auditLive() {
  const health = await getJson(`${BASELINE.origin}/health`);
  const ageMs = Date.now() - Date.parse(health.time);
  if (health.service !== 'agent-verification-utility' || health.status !== 'ok' ||
      !Number.isFinite(ageMs) || ageMs < -60000 || ageMs > 300000 ||
      !['deploy_enabled', 'runtime_enabled', 'payments_enabled', 'cost_basis_fresh'].every(k => health.checks?.[k] === true)) {
    throw new Error('Health identity/readiness/freshness gate failed; current availability is unverified');
  }
  const manifest = await getJson(`${BASELINE.origin}/.well-known/x402`);
  return { healthTime: health.time, version: health.version, ...auditManifest(manifest) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  try {
    let result;
    if (args.length === 1 && args[0] === '--live') result = await auditLive();
    else if (args.length === 2 && args[0] === '--snapshot')
      result = { mode: 'offline_snapshot', ...auditManifest(JSON.parse(await readFile(args[1], 'utf8'))) };
    else throw new Error('Usage: node scripts/avu-public-example-audit.mjs --live | --snapshot FILE.json');
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.passed ? 0 : 1;
  } catch (error) {
    console.error(JSON.stringify({ status: 'unknown', passed: false, error: error.message,
      paymentExecuted: false, note: 'Retrieval failure is not evidence of no change.' }, null, 2));
    process.exitCode = 2;
  }
}
