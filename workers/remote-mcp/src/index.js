import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import core from '../../../mcp/core.js';

const { createMcpServer } = core;
const MAX_BODY_BYTES = 1024 * 1024;

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function jsonError(status, code, message, id = null, headers = {}) {
  return new Response(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id }), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

async function tokenMatches(header, expectedToken) {
  if (!expectedToken || typeof header !== 'string' || !header.startsWith('Bearer ')) {
    return false;
  }

  const encoder = new TextEncoder();
  const suppliedDigest = await crypto.subtle.digest('SHA-256', encoder.encode(header.slice(7)));
  const expectedDigest = await crypto.subtle.digest('SHA-256', encoder.encode(expectedToken));
  const supplied = new Uint8Array(suppliedDigest);
  const expected = new Uint8Array(expectedDigest);
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected[index] ^ supplied[index];
  }
  return difference === 0;
}

function requestOriginAllowed(request, allowedOrigins) {
  const origin = request.headers.get('Origin');
  return !origin || allowedOrigins.includes(origin);
}

function responseHeaders(request, allowedOrigins) {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  const origin = request.headers.get('Origin');
  if (origin && allowedOrigins.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, MCP-Protocol-Version');
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Vary', 'Origin');
  }
  return headers;
}

async function readJson(request) {
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > MAX_BODY_BYTES) {
    const error = new Error('PAYLOAD_TOO_LARGE');
    error.code = 'PAYLOAD_TOO_LARGE';
    throw error;
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    const error = new Error('PAYLOAD_TOO_LARGE');
    error.code = 'PAYLOAD_TOO_LARGE';
    throw error;
  }
  return JSON.parse(text);
}

function withSecurityHeaders(response, request, allowedOrigins) {
  const headers = responseHeaders(request, allowedOrigins);
  for (const [name, value] of response.headers.entries()) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env) {
    const allowedOrigins = splitCsv(env.HYPERXOSIST_MCP_ALLOWED_ORIGINS);
    const allowedHosts = splitCsv(env.HYPERXOSIST_MCP_ALLOWED_HOSTS);
    const url = new URL(request.url);

    if (url.pathname === '/health' && request.method === 'GET') {
      return new Response(JSON.stringify({ ok: true, service: 'hyperxosist-remote-mcp', transport: 'streamable-http' }), {
        headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' },
      });
    }

    if (url.pathname !== '/mcp') return jsonError(404, -32004, 'Not found.');
    if (!requestOriginAllowed(request, allowedOrigins)) return jsonError(403, -32003, 'Origin not allowed.');
    if (allowedHosts.length > 0 && !allowedHosts.includes(url.hostname)) {
      return jsonError(403, -32003, 'Host not allowed.');
    }

    const headers = responseHeaders(request, allowedOrigins);
    if (request.method === 'OPTIONS') {
      if (!request.headers.get('Origin')) return jsonError(403, -32003, 'Origin not allowed.');
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== 'POST') {
      headers.set('Allow', 'POST, OPTIONS');
      return jsonError(405, -32000, 'Method not allowed.', null, Object.fromEntries(headers));
    }
    if (!env.HYPERXOSIST_MCP_TOKEN) return jsonError(503, -32603, 'Service not configured.');
    if (!(await tokenMatches(request.headers.get('Authorization'), env.HYPERXOSIST_MCP_TOKEN))) {
      headers.set('WWW-Authenticate', 'Bearer realm="hyperxosist-mcp"');
      return jsonError(401, -32001, 'Unauthorized.', null, Object.fromEntries(headers));
    }
    if (!String(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) {
      return jsonError(415, -32015, 'Content-Type must be application/json.', null, Object.fromEntries(headers));
    }

    let parsedBody;
    try {
      parsedBody = await readJson(request);
    } catch (error) {
      return error && error.code === 'PAYLOAD_TOO_LARGE'
        ? jsonError(413, -32013, 'Payload too large.', null, Object.fromEntries(headers))
        : jsonError(400, -32700, 'Parse error.', null, Object.fromEntries(headers));
    }

    let server;
    let transport;
    try {
      server = await createMcpServer();
      transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await server.connect(transport);
      return withSecurityHeaders(await transport.handleRequest(request, { parsedBody }), request, allowedOrigins);
    } catch (_error) {
      return jsonError(500, -32603, 'Internal server error.', null, Object.fromEntries(headers));
    } finally {
      if (transport) await transport.close().catch(() => {});
      if (server) await server.close().catch(() => {});
    }
  },
};

export { MAX_BODY_BYTES, readJson, requestOriginAllowed, splitCsv, tokenMatches };
