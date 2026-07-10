#!/usr/bin/env node
'use strict';

const http = require('node:http');
const { timingSafeEqual } = require('node:crypto');
const { createMcpServer } = require('./core.js');

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 15000;

function jsonError(res, status, code, message, id = null) {
  if (res.headersSent) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id }));
}

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function tokenMatches(header, expectedToken) {
  if (!expectedToken) return true;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(expectedToken);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function readJsonBody(req, maxBodyBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        const error = new Error('PAYLOAD_TOO_LARGE');
        error.code = 'PAYLOAD_TOO_LARGE';
        reject(error);
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (size > maxBodyBytes) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (_error) {
        const error = new Error('MALFORMED_JSON');
        error.code = 'MALFORMED_JSON';
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function createRemoteServer(options = {}) {
  const host = options.host || process.env.HOST || '127.0.0.1';
  const port = Number(options.port ?? process.env.PORT ?? 8787);
  const token = options.token ?? process.env.HYPERXOSIST_MCP_TOKEN ?? '';
  const maxBodyBytes = Number(
    options.maxBodyBytes ?? process.env.HYPERXOSIST_MCP_MAX_BODY_BYTES ?? DEFAULT_MAX_BODY_BYTES
  );
  const timeoutMs = Number(
    options.timeoutMs ?? process.env.HYPERXOSIST_MCP_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS
  );
  const allowedOrigins =
    options.allowedOrigins || splitCsv(process.env.HYPERXOSIST_MCP_ALLOWED_ORIGINS);
  const allowedHosts =
    options.allowedHosts || splitCsv(process.env.HYPERXOSIST_MCP_ALLOWED_HOSTS);
  const rateLimit = typeof options.rateLimit === 'function' ? options.rateLimit : null;

  const httpServer = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');

    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          ok: true,
          service: 'hyperxosist-remote-mcp',
          transport: 'streamable-http',
          authConfigured: Boolean(token),
        })
      );
      return;
    }

    if (req.url !== '/mcp') {
      jsonError(res, 404, -32004, 'Not found.');
      return;
    }

    const origin = req.headers.origin;
    if (origin && !allowedOrigins.includes(origin)) {
      jsonError(res, 403, -32003, 'Origin not allowed.');
      return;
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }

    const requestHost = String(req.headers.host || '').split(':')[0];
    if (allowedHosts.length > 0 && !allowedHosts.includes(requestHost)) {
      jsonError(res, 403, -32003, 'Host not allowed.');
      return;
    }

    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Authorization, Content-Type, Accept, MCP-Protocol-Version'
      );
      res.writeHead(204);
      res.end();
      return;
    }

    if (!tokenMatches(req.headers.authorization, token)) {
      res.setHeader('WWW-Authenticate', 'Bearer realm="hyperxosist-mcp"');
      jsonError(res, 401, -32001, 'Unauthorized.');
      return;
    }

    if (rateLimit && !(await rateLimit({ req }))) {
      jsonError(res, 429, -32029, 'Rate limit exceeded.');
      return;
    }

    if (req.method === 'GET') {
      jsonError(res, 405, -32000, 'Method not allowed for stateless MCP.');
      return;
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, GET, OPTIONS');
      jsonError(res, 405, -32000, 'Method not allowed.');
      return;
    }

    const contentType = String(req.headers['content-type'] || '').toLowerCase();
    if (!contentType.startsWith('application/json')) {
      jsonError(res, 415, -32015, 'Content-Type must be application/json.');
      return;
    }

    req.setTimeout(timeoutMs, () => {
      jsonError(res, 408, -32008, 'Request timeout.');
    });

    let body;
    try {
      body = await readJsonBody(req, maxBodyBytes);
    } catch (error) {
      if (error && error.code === 'PAYLOAD_TOO_LARGE') {
        jsonError(res, 413, -32013, 'Payload too large.');
      } else {
        jsonError(res, 400, -32700, 'Parse error.');
      }
      return;
    }

    let mcpServer;
    let transport;
    try {
      const { StreamableHTTPServerTransport } = await import(
        '@modelcontextprotocol/sdk/server/streamableHttp.js'
      );
      mcpServer = await createMcpServer({ agent: options.agent });
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (_error) {
      jsonError(res, 500, -32603, 'Internal server error.');
    } finally {
      if (transport) await transport.close().catch(() => {});
      if (mcpServer) await mcpServer.close().catch(() => {});
    }
  });

  httpServer.on('clientError', (_error, socket) => {
    if (socket.writable) {
      socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    }
  });

  httpServer.requestTimeout = timeoutMs;
  httpServer.headersTimeout = Math.max(timeoutMs + 1000, 5000);

  return {
    httpServer,
    config: { host, port, tokenConfigured: Boolean(token), maxBodyBytes, timeoutMs },
    start() {
      return new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(port, host, () => {
          httpServer.off('error', reject);
          resolve(httpServer.address());
        });
      });
    },
    stop() {
      return new Promise((resolve, reject) => {
        if (!httpServer.listening) {
          resolve();
          return;
        }
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

async function main() {
  const remote = createRemoteServer();
  const loopbackHosts = ['127.0.0.1', 'localhost', '::1'];
  if (!remote.config.tokenConfigured && !loopbackHosts.includes(remote.config.host)) {
    throw new Error('HYPERXOSIST_MCP_TOKEN is required for non-loopback binding.');
  }
  const address = await remote.start();
  const displayHost = typeof address === 'object' && address ? address.address : remote.config.host;
  const displayPort = typeof address === 'object' && address ? address.port : remote.config.port;
  console.error(
    `HyperXosist Remote MCP listening on http://${displayHost}:${displayPort}/mcp (auth configured: ${remote.config.tokenConfigured})`
  );
  if (!remote.config.tokenConfigured) {
    console.error(
      'Warning: HYPERXOSIST_MCP_TOKEN is unset. Configure Bearer authentication before public deployment.'
    );
  }

  const shutdown = async () => {
    console.error('Shutting down HyperXosist Remote MCP.');
    await remote.stop().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) {
  main().catch(() => {
    console.error('HyperXosist Remote MCP failed to start.');
    process.exit(1);
  });
}

module.exports = {
  createRemoteServer,
  jsonError,
  readJsonBody,
  tokenMatches,
};
