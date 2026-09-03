import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import core from '../../../mcp/core.js';
import {
  clientFamily,
  consumeQuota,
  createRequestId,
  emitMcpObservation,
  identifyUser,
  requestOperation,
} from './telemetry.js';

const { createMcpServer } = core;
const MAX_BODY_BYTES = 1024 * 1024;

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function jsonError(status, code, message, id = null, extraHeaders = {}) {
  const headers = new Headers(extraHeaders);
  headers.set('Cache-Control', 'no-store');
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id }), {
    status,
    headers,
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

function withRequestId(response, requestId) {
  const headers = new Headers(response.headers);
  headers.set('X-Request-Id', requestId);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const allowedOrigins = splitCsv(env.HYPERXOSIST_MCP_ALLOWED_ORIGINS);
    const allowedHosts = splitCsv(env.HYPERXOSIST_MCP_ALLOWED_HOSTS);
    const url = new URL(request.url);
    const requestId = createRequestId();
    const startedAt = Date.now();
    const publicFreeAccess = String(env.HYPERXOSIST_MCP_PUBLIC_FREE_ACCESS || '').toLowerCase() === 'true';
    const observe = (event, status, identity, operation, errorCode) => emitMcpObservation(ctx, env, {
      event,
      requestId,
      userId: identity?.user?.userId || 'anonymous',
      plan: identity?.user?.plan || 'unknown',
      operation,
      status,
      durationMs: Date.now() - startedAt,
      clientFamily: clientFamily(request),
      errorCode,
    });

    if (url.pathname === '/.well-known/mcp.json' && request.method === 'GET') {
      const response = new Response(JSON.stringify({
        name: 'HyperXosist-Agent Remote MCP',
        description: 'X/Twitter product-feedback discovery, noise-reduced search query planning, customer pain-point detection, signal filtering, and AI-agent handoff generation.',
        version: '2.6.0',
        endpoint: 'https://mcp.kgninja.dev/mcp',
        healthEndpoint: 'https://mcp.kgninja.dev/health',
        canonicalOpenApi: 'https://api.kgninja.dev/openapi.json',
        paymentOptions: 'https://api.kgninja.dev/payment-options.json',
        sourceOfTruth: 'openapi',
        lastSynced: '2026-07-19',
        transport: 'Streamable HTTP',
        authentication: publicFreeAccess ? 'none' : 'bearer',
        accessMode: publicFreeAccess ? 'public-free' : 'private-authenticated',
        authenticationRequired: !publicFreeAccess,
        publicFreeAccess,
        privateOrSelfHostedAuthentication: 'bearer',
        freeTools: [
          'hyperxosist_search_plan',
          'hyperxosist_filter_signals',
          'hyperxosist_build_handoff',
        ],
        paidTools: ['hyperxosist_execute'],
        paidExecution: {
          tool: 'hyperxosist_execute',
          protocol: 'x402',
          x402Version: 2,
          endpoint: 'https://api.kgninja.dev/hyperxosist-query',
          price: '0.01 USDC',
          network: 'eip155:8453',
          paymentRequiredHeader: 'PAYMENT-REQUIRED',
          paymentSignatureHeader: 'PAYMENT-SIGNATURE',
          paymentResponseHeader: 'PAYMENT-RESPONSE',
          confirmPaymentRequired: true,
        },
        freeToPaidFlow: {
          upgradeRequiredWhen: [
            'Automated production use of a generated X search URL',
            'Automated external collection or paid execution',
          ],
          upgradeNotRequiredWhen: [
            'MCP discovery, planning, filtering, or handoff',
            'Local preview or dry-run',
            'A human manually opens the official X search URL',
          ],
        },
      }), {
        headers: { 'Cache-Control': 'public, max-age=300', 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' },
      });
      return withRequestId(response, requestId);
    }

    if (url.pathname === '/health' && request.method === 'GET') {
      const response = new Response(JSON.stringify({
        ok: true,
        service: 'hyperxosist-remote-mcp',
        transport: 'streamable-http',
        userManagement: Boolean(env.HYPERXOSIST_MCP_TOKEN_USERS || env.HYPERXOSIST_MCP_TOKEN),
        usageTelemetry: true,
        errorMonitoring: true,
        paymentAnalytics: "external-x402-worker",
        publicFreeAccess,
        freeToolCount: 3,
        paidTools: ['hyperxosist_execute'],
      }), {
        headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' },
      });
      return withRequestId(response, requestId);
    }

    if (url.pathname !== '/mcp') return withRequestId(jsonError(404, -32004, 'Not found.'), requestId);
    if (!requestOriginAllowed(request, allowedOrigins)) return withRequestId(jsonError(403, -32003, 'Origin not allowed.'), requestId);
    if (allowedHosts.length > 0 && !allowedHosts.includes(url.hostname)) {
      return withRequestId(jsonError(403, -32003, 'Host not allowed.'), requestId);
    }

    const headers = responseHeaders(request, allowedOrigins);
    if (request.method === 'OPTIONS') {
      if (!request.headers.get('Origin')) return withRequestId(jsonError(403, -32003, 'Origin not allowed.'), requestId);
      return withRequestId(new Response(null, { status: 204, headers }), requestId);
    }
    if (request.method !== 'POST') {
      headers.set('Allow', 'POST, OPTIONS');
      return withRequestId(jsonError(405, -32000, 'Method not allowed.', null, Object.fromEntries(headers)), requestId);
    }
    if (!publicFreeAccess && !env.HYPERXOSIST_MCP_TOKEN && !env.HYPERXOSIST_MCP_TOKEN_USERS) {
      observe('mcp_configuration_error', 503, null, 'auth', 'service_not_configured');
      return withRequestId(jsonError(503, -32603, 'Service not configured.'), requestId);
    }

    const identity = publicFreeAccess ? { ok: true, user: { userId: "public", plan: "free-public", status: "active", dailyLimit: 0 } } : await identifyUser(request, env);
    if (!identity.ok) {
      observe('mcp_auth_failure', identity.status, null, 'auth', identity.reason);
      if (identity.status === 401) headers.set('WWW-Authenticate', 'Bearer realm="hyperxosist-mcp"');
      return withRequestId(jsonError(identity.status, identity.status === 401 ? -32001 : -32003, identity.status === 401 ? 'Unauthorized.' : 'User disabled.', null, Object.fromEntries(headers)), requestId);
    }

    if (!String(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) {
      observe('mcp_request_rejected', 415, identity, 'content-type', 'unsupported_media_type');
      return withRequestId(jsonError(415, -32015, 'Content-Type must be application/json.', null, Object.fromEntries(headers)), requestId);
    }

    const quota = await consumeQuota(env, identity.user);
    if (!quota.allowed) {
      observe('mcp_quota_exceeded', 429, identity, 'quota', 'daily_limit_exceeded');
      const quotaHeaders = { ...Object.fromEntries(headers), 'Retry-After': '86400' };
      return withRequestId(jsonError(429, -32029, 'Daily usage limit exceeded.', null, quotaHeaders), requestId);
    }

    let parsedBody;
    try {
      parsedBody = await readJson(request);
    } catch (error) {
      const status = error && error.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400;
      const code = status === 413 ? -32013 : -32700;
      const message = status === 413 ? 'Payload too large.' : 'Parse error.';
      observe('mcp_request_rejected', status, identity, 'parse', error?.code || 'parse_error');
      return withRequestId(jsonError(status, code, message, null, Object.fromEntries(headers)), requestId);
    }

    const operation = requestOperation(parsedBody);
    let server;
    let transport;
    try {
      server = await createMcpServer({
        paymentEnvironment: env.HYPERXOSIST_PAYMENT_ENVIRONMENT || 'production',
      });
      transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await server.connect(transport);
      const response = withRequestId(withSecurityHeaders(await transport.handleRequest(request, { parsedBody }), request, allowedOrigins), requestId);
      observe('mcp_request', response.status, identity, operation);
      return response;
    } catch (_error) {
      observe('mcp_error', 500, identity, operation, 'internal_server_error');
      return withRequestId(jsonError(500, -32603, 'Internal server error.', null, Object.fromEntries(headers)), requestId);
    } finally {
      if (transport) await transport.close().catch(() => {});
      if (server) await server.close().catch(() => {});
    }
  },
};

export { MAX_BODY_BYTES, readJson, requestOriginAllowed, splitCsv, tokenMatches, withRequestId };

