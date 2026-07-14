const MAX_USER_ID_LENGTH = 80;
const DEFAULT_USER_ID = 'default';

function sanitizeUserId(value) {
  const normalized = String(value || DEFAULT_USER_ID).trim().replace(/[^a-zA-Z0-9._:@-]/g, '_');
  return normalized.slice(0, MAX_USER_ID_LENGTH) || DEFAULT_USER_ID;
}

function createRequestId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function parseTokenUsers(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeUserRecord(value, fallbackId = DEFAULT_USER_ID) {
  const record = typeof value === 'string' ? { userId: value } : value && typeof value === 'object' ? value : {};
  const status = String(record.status || 'active').toLowerCase();
  const dailyLimit = Number(record.dailyLimit || 0);
  return {
    userId: sanitizeUserId(record.userId || record.id || fallbackId),
    plan: sanitizeUserId(record.plan || 'default'),
    status,
    dailyLimit: Number.isFinite(dailyLimit) && dailyLimit > 0 ? Math.floor(dailyLimit) : 0,
  };
}

async function identifyUser(request, env) {
  const authorization = request.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) return { ok: false, status: 401, reason: 'unauthorized' };
  const suppliedToken = authorization.slice(7);
  if (!suppliedToken) return { ok: false, status: 401, reason: 'unauthorized' };

  const primaryToken = String(env.HYPERXOSIST_MCP_TOKEN || '');
  if (primaryToken && (await tokenMatchesConstantTime(suppliedToken, primaryToken))) {
    const user = normalizeUserRecord({
      userId: env.HYPERXOSIST_MCP_DEFAULT_USER_ID || DEFAULT_USER_ID,
      plan: env.HYPERXOSIST_MCP_DEFAULT_PLAN || 'default',
      dailyLimit: env.HYPERXOSIST_MCP_DEFAULT_DAILY_LIMIT,
    });
    return user.status === 'active' ? { ok: true, user } : { ok: false, status: 403, reason: 'user_disabled' };
  }

  const users = parseTokenUsers(env.HYPERXOSIST_MCP_TOKEN_USERS);
  const key = await sha256Hex(suppliedToken);
  const record = users[key] || users[key.toLowerCase()];
  if (!record) return { ok: false, status: 401, reason: 'unauthorized' };
  const user = normalizeUserRecord(record, key.slice(0, 12));
  return user.status === 'active' ? { ok: true, user } : { ok: false, status: 403, reason: 'user_disabled' };
}

async function tokenMatchesConstantTime(suppliedToken, expectedToken) {
  const supplied = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(suppliedToken)));
  const expected = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(expectedToken)));
  let difference = supplied.length ^ expected.length;
  for (let index = 0; index < expected.length; index += 1) difference |= expected[index] ^ supplied[index];
  return difference === 0;
}

function requestOperation(body) {
  const method = body && typeof body.method === 'string' ? body.method : 'unknown';
  const tool = body?.params && typeof body.params.name === 'string' ? body.params.name : '';
  return tool ? `${method}:${tool}` : method;
}

function clientFamily(request) {
  const agent = String(request.headers.get('User-Agent') || '').toLowerCase();
  if (agent.includes('cursor')) return 'cursor';
  if (agent.includes('claude')) return 'claude';
  if (agent.includes('chatgpt') || agent.includes('openai')) return 'openai';
  if (agent.includes('vscode')) return 'vscode';
  if (agent.includes('node')) return 'node';
  return agent ? 'other' : 'unknown';
}

function emitMcpObservation(ctx, env, observation) {
  const payload = {
    event: observation.event || 'mcp_request',
    request_id: String(observation.requestId || ''),
    user_id: sanitizeUserId(observation.userId),
    plan: sanitizeUserId(observation.plan),
    operation: String(observation.operation || 'unknown').slice(0, 120),
    status: Number(observation.status || 0),
    duration_ms: Math.max(0, Math.round(Number(observation.durationMs || 0))),
    client_family: sanitizeUserId(observation.clientFamily || 'unknown'),
    error_code: observation.errorCode ? String(observation.errorCode).slice(0, 80) : null,
    paid: false,
    timestamp: new Date().toISOString(),
  };
  const write = async () => {
    console.log(JSON.stringify(payload));
    const analytics = env.MCP_ANALYTICS;
    if (analytics && typeof analytics.writeDataPoint === 'function') {
      try {
        analytics.writeDataPoint({
          blobs: [payload.event, payload.user_id, payload.operation, payload.client_family, String(payload.status)],
          doubles: [payload.duration_ms],
          indexes: [payload.user_id, payload.operation],
        });
      } catch {
        console.warn(JSON.stringify({ event: 'mcp_analytics_write_failed', request_id: payload.request_id }));
      }
    }
  };
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(write());
  else write();
}

async function consumeQuota(env, user, now = new Date()) {
  const limit = Number(user?.dailyLimit || 0);
  const kv = env.MCP_USAGE_KV;
  if (!limit || !kv || typeof kv.get !== 'function' || typeof kv.put !== 'function') {
    return { allowed: true, count: null, limit };
  }
  const day = now.toISOString().slice(0, 10);
  const key = `mcp-usage:${day}:${sanitizeUserId(user.userId)}`;
  try {
    const current = Number((await kv.get(key)) || 0);
    if (current >= limit) return { allowed: false, count: current, limit };
    const next = current + 1;
    await kv.put(key, String(next), { expirationTtl: 172800 });
    return { allowed: true, count: next, limit };
  } catch {
    return { allowed: true, count: null, limit, storageError: true };
  }
}

export {
  clientFamily,
  consumeQuota,
  createRequestId,
  emitMcpObservation,
  identifyUser,
  requestOperation,
  sanitizeUserId,
  sha256Hex,
};