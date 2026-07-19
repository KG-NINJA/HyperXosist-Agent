Exit code: 0
Wall time: 1.8 seconds
Output:
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const endpoints = require('../payment-endpoints.js');
const production = endpoints.resolve('production');
const staging = endpoints.resolve('staging');
const openapiUrl = 'https://api.kgninja.dev/openapi.json';
const files = [
  'agent-tools.json',
  'agent-use.json',
  'examples/agent-session.example.json',
  'signal-to-fix-pipeline.json',
  'x402-payment.json',
  'mcp-catalog.json',
  '.well-known/mcp.json',
];
const check = process.argv.includes('--check');
const live = check || process.argv.includes('--live');

function replaceUrls(value) {
  if (typeof value === 'string') return value.split(staging.baseUrl).join(production.baseUrl);
  if (Array.isArray(value)) return value.map(replaceUrls);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceUrls(item)]));
  }
  return value;
}

function paidOperations(openapi) {
  return Object.entries(openapi.paths || {})
    .flatMap(([path, item]) => Object.entries(item || {}).map(([method, operation]) => ({ path, method, operation })))
    .filter(({ method, operation }) => method === 'post' && operation && operation['x-access-tier'] === 'paid')
    .map(({ path, method, operation }) => ({
      endpoint: path,
      method: method.toUpperCase(),
      price: operation['x-payment-info']?.price,
      network: operation['x-payment-info']?.network,
      expectedUnpaidStatus: operation.responses?.['402'] ? 402 : null,
      expectedPaidStatus: operation.responses?.['200'] ? 200 : null,
    }));
}

async function readOpenApiContract() {
  const response = await fetch(openapiUrl, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`OpenAPI fetch failed: HTTP ${response.status}`);
  const openapi = await response.json();
  if (openapi?.openapi !== '3.1.0' || openapi?.x402?.protocol !== 'x402') {
    throw new Error('OpenAPI contract is missing OpenAPI 3.1 or x402 metadata.');
  }
  const displayPrice = String(openapi.x402.price || '$0.01');
  const amount = displayPrice.replace(/^\$/, '');
  const operations = paidOperations(openapi);
  const hyper = operations.find((operation) => operation.endpoint === '/hyperxosist-query');
  if (!hyper) throw new Error('OpenAPI contract does not expose /hyperxosist-query as paid.');
  return {
    openapi,
    canonicalOpenApi: openapiUrl,
    paymentOptions: 'https://api.kgninja.dev/payment-options.json',
    displayPrice,
    amount,
    network: String(openapi.x402.network),
    paidEndpoint: `https://api.kgninja.dev${hyper.endpoint}`,
    paidOperations: operations,
    freeToPaidFlow: openapi['x-free-to-paid-flow'] || {},
  };
}

function applyContract(document, relative, contract) {
  const next = replaceUrls(document);
  if (!contract) return next;

  next.sourceOfTruth = 'openapi';
  next.canonicalOpenApi = contract.canonicalOpenApi;
  next.paymentOptions = contract.paymentOptions;
  if (!check) next.lastSynced = new Date().toISOString().slice(0, 10);

  if (relative === 'agent-tools.json') {
    next.sourceOfTruth = 'openapi';
    next.paidEndpoint = contract.paidEndpoint;
    next.paidOperations = contract.paidOperations;
  }
  if (relative === 'agent-use.json') {
    next.remoteMcp = next.remoteMcp || {};
    next.remoteMcp.canonicalOpenApi = contract.canonicalOpenApi;
    next.remoteMcp.paymentOptions = contract.paymentOptions;
    next.remoteMcp.sourceOfTruth = 'openapi';
    next.remoteMcp.freeToPaidFlow = contract.freeToPaidFlow;
    next.payment = next.payment || {};
    next.payment.sourceOfTruth = 'openapi';
    next.payment.canonicalOpenApi = contract.canonicalOpenApi;
    next.payment.endpoint = contract.paidEndpoint;
    next.payment.paymentOptionsEndpoint = contract.paymentOptions;
    next.payment.expectedUnpaidStatus = 402;
    next.payment.expectedPaidStatus = 200;
    next.costModel = next.costModel || {};
    next.costModel.perPaidQuery = Number(contract.amount);
  }
  if (relative === 'x402-payment.json') {
    next.network = contract.network;
    next.networkName = contract.network === 'eip155:8453' ? 'Base' : 'Base Sepolia';
    next.price = next.price || {};
    next.price.amount = contract.amount;
    next.price.display = contract.displayPrice;
    next.paymentEndpoint = contract.paidEndpoint;
    next.paidQueryEndpoint = contract.paidEndpoint;
    next.paymentOptionsEndpoint = contract.paymentOptions;
    next.freeToPaidFlow = contract.freeToPaidFlow;
  }
  if (relative === 'mcp-catalog.json') {
    next.canonicalOpenApi = contract.canonicalOpenApi;
    next.paymentOptions = contract.paymentOptions;
    next.paidExecution = next.paidExecution || {};
    next.paidExecution.endpoint = contract.paidEndpoint;
    next.paidExecution.price = `${contract.amount} USDC`;
    next.paidExecution.network = contract.network;
    next.freeToPaidFlow = contract.freeToPaidFlow;
  }
  if (relative === '.well-known/mcp.json') {
    next.canonicalOpenApi = contract.canonicalOpenApi;
    next.paymentOptions = contract.paymentOptions;
    next.sourceOfTruth = 'openapi';
    next.paidExecution = next.paidExecution || {};
    next.paidExecution.endpoint = contract.paidEndpoint;
    next.paidExecution.price = `${contract.amount} USDC`;
    next.paidExecution.network = contract.network;
    next.freeToPaidFlow = contract.freeToPaidFlow;
  }
  if (relative === 'signal-to-fix-pipeline.json') {
    next.paymentEndpoint = contract.paidEndpoint;
    next.canonicalOpenApi = contract.canonicalOpenApi;
    next.freeToPaidFlow = contract.freeToPaidFlow;
  }
  return next;
}

const contract = live ? await readOpenApiContract() : null;
let changed = false;
for (const relative of files) {
  const file = resolve(process.cwd(), relative);
  const before = readFileSync(file, 'utf8');
  const document = JSON.parse(before);
  const next = JSON.stringify(applyContract(document, relative, contract), null, relative === 'mcp-catalog.json' ? 0 : 2) + '\n';
  if (before !== next) {
    changed = true;
    if (!check) writeFileSync(file, next);
    console.log((check ? 'OUTDATED ' : 'SYNCED ') + relative);
  }
}
if (check && changed) process.exitCode = 1;

