import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';

globalThis.crypto ??= webcrypto;
const { default: worker } = await import('../workers/remote-mcp/src/index.js');
const env = { HYPERXOSIST_MCP_TOKEN: 'test-token', HYPERXOSIST_MCP_ALLOWED_ORIGINS: 'https://app.example.com', HYPERXOSIST_MCP_ALLOWED_HOSTS: 'mcp.example.com' };
function request(path, options = {}) { return new Request(`https://mcp.example.com${path}`, options); }
test('Cloudflare Worker rejects unauthenticated and disallowed requests', async () => {
  assert.equal((await worker.fetch(request('/mcp', { method: 'POST' }), env)).status, 401);
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
});
