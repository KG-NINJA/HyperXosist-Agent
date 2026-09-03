import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';

globalThis.crypto ??= webcrypto;
const { default: worker } = await import('../workers/remote-mcp/src/index.js');
const { consumeQuota, identifyUser, sha256Hex } = await import('../workers/remote-mcp/src/telemetry.js');
const env = { HYPERXOSIST_MCP_TOKEN: 'test-token', HYPERXOSIST_MCP_ALLOWED_ORIGINS: 'https://app.example.com', HYPERXOSIST_MCP_ALLOWED_HOSTS: 'mcp.example.com' };
function request(path, options = {}) { return new Request(`https://mcp.example.com${path}`, options); }
test('Cloudflare Worker rejects unauthenticated and disallowed requests', async () => {
  const unauthorized = await worker.fetch(request('/mcp', { method: 'POST' }), env);
  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.headers.get('cache-control'), 'no-store');
  assert.equal(unauthorized.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await worker.fetch(request('/mcp', { method: 'POST', headers: { Authorization: 'Bearer test-token', Origin: 'https://untrusted.example.com' } }), env)).status, 403);
  assert.equal((await worker.fetch(request('/mcp', { method: 'POST', headers: { Authorization: 'Bearer test-token' } }), { ...env, HYPERXOSIST_MCP_TOKEN: '' })).status, 503);
});
test('Cloudflare Worker handles a stateless MCP initialize request', async () => {
  const response = await worker.fetch(request('/mcp', { method: 'POST', headers: { Authorization: 'Bearer test-token', Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json', Origin: 'https://app.example.com' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } } }) }), env);
  assert.equal(response.status, 200); assert.equal(response.headers.get('access-control-allow-origin'), 'https://app.example.com'); assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json(); assert.equal(body.jsonrpc, '2.0'); assert.equal(body.id, 1); assert.equal(body.result.serverInfo.name, 'hyperxosist-mcp-server');
});

test('Cloudflare Worker serves the shared X search-plan tool', async () => {
  const response = await worker.fetch(request('/mcp', { method: 'POST', headers: { Authorization: 'Bearer test-token', Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'hyperxosist_search_plan', arguments: { intent: 'Find bug reports about HyperXosist-Agent' } } }) }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.id, 2);
  assert.equal(body.result.structuredContent.type, 'hyperxosist.search_plan.v1');
  assert.ok(body.result.structuredContent.searchUrls.every((url) => url.startsWith('https://x.com/search')));
  assert.ok(body.result.structuredContent.mission.steps.every((step) => step.paidRequest.endpoint === 'https://api.kgninja.dev/hyperxosist-query'));
  assert.equal(body.result.structuredContent.accessTier, 'free');
  assert.equal(body.result.structuredContent.canonicalOpenApi, 'https://api.kgninja.dev/openapi.json');
  assert.equal(body.result.structuredContent.paidEndpoint, 'https://api.kgninja.dev/hyperxosist-query');
  assert.doesNotMatch(JSON.stringify(body.result.structuredContent), /workers\.dev|mainnet-staging/);
});

test('Cloudflare Worker keeps staging payment URLs in the staging environment', async () => {
  const response = await worker.fetch(request('/mcp', { method: 'POST', headers: { Authorization: 'Bearer test-token', Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'hyperxosist_search_plan', arguments: { intent: 'Find bug reports about HyperXosist-Agent' } } }) }), { ...env, HYPERXOSIST_PAYMENT_ENVIRONMENT: 'staging' });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(body.result.structuredContent.mission.steps.every((step) => step.paidRequest.endpoint.includes('mainnet-staging.fuwafuwow.workers.dev')));
});

test('Remote MCP exposes request IDs and operational health capabilities', async () => {
  const health = await worker.fetch(request('/health', { method: 'GET' }), env);
  assert.equal(health.status, 200);
  assert.match(health.headers.get('x-request-id') || '', /^[0-9a-f-]{36}$/);
  const body = await health.json();
  assert.equal(body.usageTelemetry, true);
  assert.equal(body.errorMonitoring, true);
  assert.equal(body.paymentAnalytics, 'external-x402-worker');
});

test('public-free production mode requires no Bearer token and advertises the same policy', async () => {
  const publicEnv = { ...env, HYPERXOSIST_MCP_PUBLIC_FREE_ACCESS: 'true' };
  const discovery = await worker.fetch(request('/.well-known/mcp.json', { method: 'GET' }), publicEnv);
  assert.equal(discovery.status, 200);
  const metadata = await discovery.json();
  assert.equal(metadata.authentication, 'none');
  assert.equal(metadata.authenticationRequired, false);
  assert.equal(metadata.publicFreeAccess, true);
  assert.equal(metadata.paidExecution.authentication, 'x402-payment-proof');

  const response = await worker.fetch(request('/mcp', {
    method: 'POST',
    headers: { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'public-test', version: '1.0.0' } } })
  }), publicEnv);
  assert.equal(response.status, 200);

  const health = await worker.fetch(request('/health', { method: 'GET' }), publicEnv);
  const healthBody = await health.json();
  assert.equal(healthBody.authentication, 'none');
  assert.equal(healthBody.authenticationRequired, false);
});

test('token registry identifies users without exposing raw tokens', async () => {
  const hash = await sha256Hex('mapped-token');
  const identity = await identifyUser(
    request('/mcp', { headers: { Authorization: 'Bearer mapped-token' } }),
    { HYPERXOSIST_MCP_TOKEN_USERS: JSON.stringify({ [hash]: { userId: 'agent-a', plan: 'pro', dailyLimit: 2 } }) }
  );
  assert.equal(identity.ok, true);
  assert.deepEqual(identity.user, { userId: 'agent-a', plan: 'pro', status: 'active', dailyLimit: 2 });
});

test('KV quota blocks a user after the configured daily limit', async () => {
  const values = new Map();
  const kv = {
    async get(key) { return values.get(key) || null; },
    async put(key, value) { values.set(key, value); },
  };
  const user = { userId: 'agent-a', dailyLimit: 2 };
  assert.equal((await consumeQuota({ MCP_USAGE_KV: kv }, user, new Date('2026-07-12T00:00:00Z'))).allowed, true);
  assert.equal((await consumeQuota({ MCP_USAGE_KV: kv }, user, new Date('2026-07-12T00:00:00Z'))).allowed, true);
  assert.equal((await consumeQuota({ MCP_USAGE_KV: kv }, user, new Date('2026-07-12T00:00:00Z'))).allowed, false);
});

