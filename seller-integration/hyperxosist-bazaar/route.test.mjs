import test from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { paymentMiddleware, x402ResourceServer } from '@x402/hono';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { declareDiscoveryExtension, bazaarResourceServerExtension } from '@x402/extensions/bazaar';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  addHyperxosistBazaar, discoveryOptions, INPUT_SCHEMA, OUTPUT_SCHEMA,
  INPUT_EXAMPLE, OUTPUT_EXAMPLE, ROUTE_KEY, RESOURCE,
} from './route.mjs';

const NETWORK = 'eip155:8453';
const PAY_TO = '0x4D7d842536De9Eb491AE2300126B3CDdE7B0aDE3';
const ASSET = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
const originalRoutes = () => ({
  [ROUTE_KEY]: {
    accepts: { scheme: 'exact', network: NETWORK, payTo: PAY_TO, price: '$0.01' },
    description: 'Generate a filtered query and official X search URL. Does not fetch posts.',
    mimeType: 'application/json',
  },
  'POST /fix-error': {
    accepts: { scheme: 'exact', network: NETWORK, payTo: PAY_TO, price: '$0.01' },
    description: 'Other paid route left unchanged', mimeType: 'application/json',
  },
});

function appFixture(patched) {
  const calls = { supported: 0, verify: 0, settle: 0, handler: 0 };
  // Isolated SDK test only. This object cannot verify or settle a real payment.
  const facilitator = {
    getSupported: async () => {
      calls.supported++;
      return {
        kinds: [{ x402Version: 2, scheme: 'exact', network: NETWORK }],
        extensions: [], signers: {},
      };
    },
    verify: async () => { calls.verify++; throw new Error('PAYMENTS_FORBIDDEN_IN_TEST'); },
    settle: async () => { calls.settle++; throw new Error('PAYMENTS_FORBIDDEN_IN_TEST'); },
  };
  const server = new x402ResourceServer(facilitator).register(NETWORK, new ExactEvmScheme());
  // Explicit registration avoids relying on framework dynamic-import side effects.
  if (patched) server.registerExtension(bazaarResourceServerExtension);
  const routes = patched ? addHyperxosistBazaar(originalRoutes(), declareDiscoveryExtension) : originalRoutes();
  const app = new Hono();
  app.use('*', paymentMiddleware(routes, server));
  app.post('/hyperxosist-query', c => { calls.handler++; return c.json({ forbidden: true }); });
  app.get('/hyperxosist-query-dry-run', c => c.json({ free: true }));
  return { app, calls };
}
async function unpaid(patched, headers = {}) {
  const fixture = appFixture(patched);
  const response = await fixture.app.request(RESOURCE, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(INPUT_EXAMPLE),
  });
  return { ...fixture, response };
}
const decode = response => JSON.parse(Buffer.from(response.headers.get('PAYMENT-REQUIRED'), 'base64').toString('utf8'));

test('baseline reproduces a payable 402 lacking Bazaar metadata', async () => {
  const { response, calls } = await unpaid(false);
  assert.equal(response.status, 402);
  const challenge = decode(response);
  assert.equal(challenge.extensions?.bazaar, undefined);
  assert.equal(challenge.accepts[0].amount, '10000');
  assert.equal(calls.handler, 0); assert.equal(calls.verify, 0); assert.equal(calls.settle, 0);
});
test('real Hono/x402 SDK emits the added Bazaar extension on its actual 402 header', async () => {
  const { response, calls } = await unpaid(true);
  assert.equal(response.status, 402);
  const challenge = decode(response);
  assert.equal(challenge.x402Version, 2);
  assert.equal(challenge.resource.url, RESOURCE);
  assert.equal(challenge.accepts[0].network, NETWORK);
  assert.equal(challenge.accepts[0].amount, '10000');
  assert.equal(challenge.accepts[0].payTo.toLowerCase(), PAY_TO.toLowerCase());
  assert.equal(challenge.accepts[0].asset.toLowerCase(), ASSET.toLowerCase());
  const b = challenge.extensions.bazaar;
  assert.equal(b.info.input.method, 'POST');
  assert.equal(b.info.input.bodyType, 'json');
  assert.deepEqual(b.info.input.body, INPUT_EXAMPLE);
  assert.deepEqual(b.info.output.example, OUTPUT_EXAMPLE);
  assert.equal(ajv.validate(b.schema, b.info), true, JSON.stringify(ajv.errors));
  const body = await response.json();
  if (body.x402Version === 2) assert.deepEqual(body, challenge);
  assert.equal(calls.handler, 0); assert.equal(calls.verify, 0); assert.equal(calls.settle, 0);
});
test('adding discovery does not change actual monetary requirements', async () => {
  const before = decode((await unpaid(false)).response);
  const after = decode((await unpaid(true)).response);
  assert.deepEqual(after.accepts, before.accepts);
  assert.deepEqual(after.resource, before.resource);
});
test('free dry run remains free and never reaches a paid handler', async () => {
  const { app, calls } = appFixture(true);
  const response = await app.request('https://api.kgninja.dev/hyperxosist-query-dry-run');
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { free: true });
  assert.equal(response.headers.get('PAYMENT-REQUIRED'), null);
  assert.equal(calls.handler, 0); assert.equal(calls.verify, 0); assert.equal(calls.settle, 0);
});
test('malformed payment signature does not unlock the handler', async () => {
  const { response, calls } = await unpaid(true, { 'PAYMENT-SIGNATURE': 'not-base64-json' });
  assert.equal(response.status, 402);
  assert.equal(calls.handler, 0); assert.equal(calls.verify, 0); assert.equal(calls.settle, 0);
});
test('only the targeted route and its Bazaar metadata are replaced', () => {
  const before = originalRoutes();
  const otherExtension = { info: { keep: true } };
  const hook = () => {};
  before[ROUTE_KEY].extensions = { custom: otherExtension };
  before[ROUTE_KEY].customHook = hook;
  const snapshot = { ...before[ROUTE_KEY] };
  const after = addHyperxosistBazaar(before, declareDiscoveryExtension);
  assert.equal(after['POST /fix-error'], before['POST /fix-error']);
  assert.equal(after[ROUTE_KEY].accepts, before[ROUTE_KEY].accepts);
  assert.equal(after[ROUTE_KEY].extensions.custom, otherExtension);
  assert.equal(after[ROUTE_KEY].customHook, hook);
  assert.deepEqual(before[ROUTE_KEY], snapshot);
  const strip = route => Object.fromEntries(Object.entries(route).filter(([k]) => k !== 'extensions'));
  assert.deepEqual(strip(after[ROUTE_KEY]), strip(before[ROUTE_KEY]));
});
test('existing Bazaar, unknown route, wildcard and invalid paid config fail closed', () => {
  for (const routes of [null, {}, { 'POST /*': originalRoutes()[ROUTE_KEY] },
    { [ROUTE_KEY]: {} }, { [ROUTE_KEY]: { accepts: null } },
    { [ROUTE_KEY]: { accepts: {}, extensions: [] } },
    { [ROUTE_KEY]: { accepts: {}, extensions: { bazaar: {} } } }]) {
    assert.throws(() => addHyperxosistBazaar(routes, declareDiscoveryExtension));
  }
});
test('unexpected SDK output is never installed', () => {
  for (const result of [null, {}, { bazaar: {} }, { bazaar: { info: {}, schema: {} }, extra: {} }]) {
    assert.throws(() => addHyperxosistBazaar(originalRoutes(), () => result));
  }
});
test('sample body and complete output satisfy their respective recorded schemas', () => {
  assert.equal(ajv.validate(INPUT_SCHEMA, INPUT_EXAMPLE), true);
  assert.equal(ajv.validate(INPUT_SCHEMA, {}), false);
  assert.equal(ajv.validate(OUTPUT_SCHEMA, OUTPUT_EXAMPLE), true, JSON.stringify(ajv.errors));
  const bad = structuredClone(OUTPUT_EXAMPLE); delete bad.payment;
  assert.equal(ajv.validate(OUTPUT_SCHEMA, bad), false);
});
test('SDK mutation cannot corrupt the next metadata declaration', () => {
  const first = discoveryOptions(); first.input.keywords = 'changed';
  first.output.example.payment.price = '$1'; first.inputSchema.required = [];
  const next = discoveryOptions();
  assert.equal(next.input.keywords, INPUT_EXAMPLE.keywords);
  assert.equal(next.output.example.payment.price, '$0.01');
  assert.deepEqual(next.inputSchema.required, ['keywords']);
});
