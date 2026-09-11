#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION_OLD = "2.5.0"
VERSION_NEW = "2.6.0"


def read_preserved(path: str) -> tuple[str, str]:
    raw = (ROOT / path).read_bytes()
    newline = "\r\n" if b"\r\n" in raw else "\n"
    return raw.decode("utf-8").replace("\r\n", "\n"), newline


def write_preserved(path: str, text: str, newline: str | None = None) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    if newline is None and target.exists():
        _, newline = read_preserved(path)
    newline = newline or "\n"
    normalized = text.replace("\r\n", "\n")
    target.write_bytes(normalized.replace("\n", newline).encode("utf-8"))


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def load_json(path: str):
    text, newline = read_preserved(path)
    return json.loads(text), newline


def write_json(path: str, value, newline: str, compact: bool = False) -> None:
    if compact:
        text = json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n"
    else:
        text = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    write_preserved(path, text, newline)


WEBMCP_JS = r'''/**
 * HyperXosist ChatGPT Site Tools / WebMCP adapter.
 *
 * Free tools remain local and read-only. The optional hyperxosist_execute tool is
 * an open-world bridge to the existing x402 Worker. It never accepts a wallet,
 * private key, seed phrase, mnemonic, or signing secret. A caller first requests
 * live payment requirements, obtains an opaque x402 proof outside this page, and
 * then retries with explicit confirmation.
 */
(function (root) {
  'use strict';

  const STATE_KEY = '__hyperxosistWebMcpState';
  const PAID_TOOL_NAME = 'hyperxosist_execute';
  const CONFIRMATION = 'CONFIRM_X402_PAYMENT';
  const MAX_SIGNATURE_LENGTH = 32768;
  const MAX_REQUEST_CHARS = 131072;
  const MAX_RESPONSE_CHARS = 1048576;
  const SECRET_FIELD_RE = /(^|_)(private.?key|secret.?key|seed.?phrase|mnemonic|wallet.?secret|api.?key|authorization|payment.?(proof|signature|header))($|_)/i;
  const documentRef = root && root.document;
  const modelContext = documentRef && documentRef.modelContext;

  // WebMCP is feature-detected so unsupported browsers keep the normal site unchanged.
  if (!modelContext || typeof modelContext.registerTool !== 'function') return;

  const Agent = root.HyperXosistAgent;
  if (!Agent || typeof Agent.dispatchToolCall !== 'function') {
    if (root.console && typeof root.console.warn === 'function') {
      root.console.warn('[HyperXosist WebMCP] HyperXosistAgent dispatcher unavailable; Site Tools skipped.');
    }
    return;
  }

  const PaymentEndpoints = root.HyperXosistPaymentEndpoints;
  const state = root[STATE_KEY] || (root[STATE_KEY] = { registered: Object.create(null) });

  function getSignal(context) {
    if (!context || typeof context !== 'object') return null;
    if (typeof context.aborted === 'boolean') return context;
    return context.signal && typeof context.signal === 'object' ? context.signal : null;
  }

  function assertNotAborted(signal) {
    if (!signal || !signal.aborted) return;
    const error = new Error('WebMCP execution aborted.');
    error.name = 'AbortError';
    throw error;
  }

  function jsonClone(value) {
    if (value === undefined) return null;
    return JSON.parse(JSON.stringify(value));
  }

  async function dispatchLocal(name, args, context) {
    const signal = getSignal(context);
    assertNotAborted(signal);

    const dispatched = Agent.dispatchToolCall(name, args || {});
    if (!dispatched || dispatched.ok !== true) {
      const message = dispatched && dispatched.message ? dispatched.message : 'HyperXosist dispatch failed.';
      throw new Error(message);
    }

    assertNotAborted(signal);
    try {
      return jsonClone(dispatched.result);
    } catch (_error) {
      throw new Error('HyperXosist returned a non-serializable WebMCP result.');
    }
  }

  function findSecretField(value, path) {
    if (!value || typeof value !== 'object') return null;
    const currentPath = path || 'input';
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (SECRET_FIELD_RE.test(key.replace(/([a-z])([A-Z])/g, '$1_$2'))) {
        return currentPath + '.' + key;
      }
      const nested = findSecretField(value[key], currentPath + '.' + key);
      if (nested) return nested;
    }
    return null;
  }

  function validateSignature(value) {
    const signature = String(value || '').trim();
    if (!signature) throw new Error('paymentSignature is required for action="execute".');
    if (signature.length > MAX_SIGNATURE_LENGTH) throw new Error('paymentSignature is too large.');
    if (/\r|\n/.test(signature)) throw new Error('paymentSignature must be a single HTTP header value.');
    return signature;
  }

  function getHeader(response, name) {
    if (!response || !response.headers || typeof response.headers.get !== 'function') return null;
    const value = response.headers.get(name);
    if (value == null) return null;
    return String(value).slice(0, 32768);
  }

  async function readResponseBody(response, signal) {
    assertNotAborted(signal);
    const text = await response.text();
    assertNotAborted(signal);
    if (text.length > MAX_RESPONSE_CHARS) {
      throw new Error('x402 response exceeded the WebMCP safety limit.');
    }
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (_error) {
      return { text: text };
    }
  }

  function resolveTrustedPaidRequest(args) {
    if (!PaymentEndpoints || typeof PaymentEndpoints.resolve !== 'function') {
      throw new Error('HyperXosist payment endpoint registry is unavailable.');
    }
    const environment = String(
      (args && args.paymentEnvironment) || PaymentEndpoints.defaultEnvironment || 'production'
    ).toLowerCase();
    if (environment !== 'production' && environment !== 'staging') {
      throw new Error('paymentEnvironment must be production or staging.');
    }

    const trusted = PaymentEndpoints.resolve(environment);
    const dispatched = Agent.dispatchToolCall('hyperxosist_build_paid_request', {
      input: (args && args.input) || {},
      paymentEnvironment: environment
    });
    if (!dispatched || dispatched.ok !== true || !dispatched.result) {
      throw new Error(
        dispatched && dispatched.message ? dispatched.message : 'Unable to build the trusted x402 request.'
      );
    }
    const paidRequest = jsonClone(dispatched.result);
    if (paidRequest.endpoint !== trusted.paymentEndpoint) {
      throw new Error('Blocked an untrusted paid execution endpoint.');
    }
    if (
      paidRequest.paymentOptionsEndpoint &&
      paidRequest.paymentOptionsEndpoint !== trusted.paymentOptionsEndpoint
    ) {
      throw new Error('Blocked untrusted x402 payment metadata.');
    }
    return { environment: environment, trusted: trusted, paidRequest: paidRequest };
  }

  async function executePaid(args, context) {
    const input = args || {};
    const signal = getSignal(context);
    assertNotAborted(signal);

    const action = String(input.action || '').toLowerCase();
    if (action !== 'requirements' && action !== 'execute') {
      throw new Error('action must be "requirements" or "execute".');
    }

    const secretField = findSecretField(input.input || {}, 'input');
    if (secretField) {
      throw new Error('Wallet or signing secrets are not accepted (' + secretField + ').');
    }

    let paymentSignature = null;
    let paymentHeader = 'PAYMENT-SIGNATURE';
    if (action === 'requirements') {
      if (input.paymentSignature) {
        throw new Error('Do not send paymentSignature while requesting requirements.');
      }
    } else {
      if (input.confirmPaidExecution !== CONFIRMATION) {
        throw new Error(
          'Paid execution requires explicit confirmation: confirmPaidExecution="' + CONFIRMATION + '".'
        );
      }
      paymentSignature = validateSignature(input.paymentSignature);
      paymentHeader = String(input.paymentHeader || 'PAYMENT-SIGNATURE').toUpperCase();
      if (paymentHeader !== 'PAYMENT-SIGNATURE' && paymentHeader !== 'X-PAYMENT') {
        throw new Error('paymentHeader must be PAYMENT-SIGNATURE or X-PAYMENT.');
      }
    }

    if (typeof root.fetch !== 'function') {
      throw new Error('Browser fetch is unavailable for x402 execution.');
    }

    const resolved = resolveTrustedPaidRequest(input);
    const requestBody = JSON.stringify(resolved.paidRequest.body || {});
    if (requestBody.length > MAX_REQUEST_CHARS) {
      throw new Error('Paid execution input exceeded the WebMCP safety limit.');
    }

    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    };
    if (paymentSignature) headers[paymentHeader] = paymentSignature;

    assertNotAborted(signal);
    const response = await root.fetch.call(root, resolved.paidRequest.endpoint, {
      method: 'POST',
      headers: headers,
      body: requestBody,
      signal: signal || undefined,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer'
    });
    const responseBody = await readResponseBody(response, signal);
    const status = Number(response.status || 0);
    const ok = response.ok === true || (status >= 200 && status < 300);
    const paymentHeaders = {
      paymentRequired: getHeader(response, 'PAYMENT-REQUIRED'),
      paymentResponse: getHeader(response, 'PAYMENT-RESPONSE'),
      legacyPaymentResponse: getHeader(response, 'X-PAYMENT-RESPONSE'),
      requestId: getHeader(response, 'X-REQUEST-ID'),
      contentType: getHeader(response, 'CONTENT-TYPE')
    };

    if (action === 'requirements' && ok) {
      throw new Error('Paid endpoint unexpectedly accepted an unsigned request; result withheld.');
    }

    const result = {
      type: 'hyperxosist.webmcp_x402.v1',
      tool: PAID_TOOL_NAME,
      action: action,
      phase: status === 402 ? 'payment_required' : ok ? 'executed' : 'failed',
      status: status,
      paymentAccepted: action === 'execute' && ok,
      paymentRequired: status === 402,
      retryable: status === 402,
      environment: resolved.environment,
      endpoint: resolved.paidRequest.endpoint,
      paymentOptionsEndpoint: resolved.trusted.paymentOptionsEndpoint,
      paymentHeaderUsed: action === 'execute' ? paymentHeader : null,
      paymentHeaders: paymentHeaders,
      response: responseBody,
      next:
        status === 402
          ? 'Read the live payment requirements, obtain an opaque x402 proof outside this page, obtain user approval, then call action="execute".'
          : ok
            ? 'Use the paid result; never persist or echo the payment signature.'
            : 'Inspect the status and response, then retry only when safe.'
    };

    return jsonClone(result);
  }

  const tools = [
    {
      name: 'hyperxosist_search_plan',
      title: 'Create HyperXosist Search Plan',
      description:
        'Convert a natural-language X/Twitter research goal into a structured HyperXosist search plan. Planning is local and free. This tool does not scrape X or execute paid production searches.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        untrustedContentHint: false
      },
      inputSchema: {
        type: 'object',
        properties: {
          intent: {
            type: 'string',
            description: 'Natural-language research goal.'
          },
          subject: {
            type: 'string',
            description: 'Optional product, project, person, or entity name.'
          },
          lang: {
            type: 'string',
            description: 'Optional language code such as ja or en.'
          },
          missionId: {
            type: 'string',
            description: 'Optional HyperXosist mission identifier.'
          }
        },
        required: ['intent'],
        additionalProperties: false
      },
      execute: function (args, context) {
        return dispatchLocal('hyperxosist_plan_from_intent', args || {}, context);
      }
    },
    {
      name: 'hyperxosist_filter_signals',
      title: 'Filter HyperXosist Signals',
      description:
        'Score and filter user-supplied candidate feedback/signals and return the keep-only signal set for downstream engineering use. This tool does not fetch posts from X.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        untrustedContentHint: true
      },
      inputSchema: {
        type: 'object',
        properties: {
          signals: {
            type: 'array',
            items: { type: 'string' },
            description: 'Candidate feedback or posts supplied by the caller.'
          },
          minScore: {
            type: 'number',
            description: 'Optional minimum keep score.'
          }
        },
        required: ['signals'],
        additionalProperties: false
      },
      execute: function (args, context) {
        const mapped = { feedback: (args && args.signals) || [] };
        if (args && args.minScore !== undefined) mapped.minScore = args.minScore;
        return dispatchLocal('hyperxosist_filter_keep_signals', mapped, context);
      }
    },
    {
      name: 'hyperxosist_build_handoff',
      title: 'Build Signal-to-Fix Handoff',
      description:
        'Build a structured keep-only engineering handoff package from supplied product feedback for Signal-to-Fix or a coding agent. This tool does not deploy code or submit pull requests.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        untrustedContentHint: true
      },
      inputSchema: {
        type: 'object',
        properties: {
          productName: { type: 'string' },
          productUrl: { type: 'string' },
          targetArea: { type: 'string' },
          feedback: {
            type: 'array',
            items: { type: 'string' }
          },
          context: { type: 'string' }
        },
        required: ['productName', 'feedback'],
        additionalProperties: false
      },
      execute: function (args, context) {
        return dispatchLocal('hyperxosist_build_handoff', args || {}, context);
      }
    },
    {
      name: PAID_TOOL_NAME,
      title: 'Execute HyperXosist Production Query (x402)',
      description:
        'Two-step x402 production gateway. First call action="requirements" without payment material to receive HTTP 402 terms. After explicit user approval and external signing, call action="execute" with only the opaque payment header value. This tool may spend USDC under the live terms. Never provide private keys, seed phrases, mnemonics, wallets, or signing secrets.',
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
        untrustedContentHint: true
      },
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['requirements', 'execute'],
            description: 'requirements obtains live HTTP 402 terms; execute submits an externally produced proof.'
          },
          input: {
            type: 'object',
            description: 'Structured HyperXosist query input. Do not include wallet or signing secrets.',
            additionalProperties: true
          },
          paymentEnvironment: {
            type: 'string',
            enum: ['production', 'staging'],
            description: 'Defaults to production.'
          },
          paymentSignature: {
            type: 'string',
            description: 'Opaque x402 payment proof/header value. Never a private key, seed phrase, mnemonic, or wallet secret.'
          },
          paymentHeader: {
            type: 'string',
            enum: ['PAYMENT-SIGNATURE', 'X-PAYMENT'],
            description: 'Use the header advertised by the live payment requirements; defaults to PAYMENT-SIGNATURE.'
          },
          confirmPaidExecution: {
            type: 'string',
            enum: [CONFIRMATION],
            description: 'Required only for execute, and only after explicit user approval of the live payment terms.'
          }
        },
        required: ['action', 'input'],
        additionalProperties: false
      },
      execute: executePaid
    }
  ];

  tools.forEach(function (tool) {
    if (state.registered[tool.name]) return;
    try {
      modelContext.registerTool(tool);
      state.registered[tool.name] = true;
    } catch (error) {
      if (root.console && typeof root.console.error === 'function') {
        root.console.error(
          '[HyperXosist WebMCP] Failed to register ' + tool.name + ':',
          error && error.message ? error.message : error
        );
      }
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
'''


WEBMCP_TEST = r'''/**
 * Zero-dependency tests for the browser-only WebMCP adapter.
 * Run: node test/webmcp.test.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'webmcp.js'), 'utf8');
let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
  }
}

function mockResponse(status, body, headers = {}) {
  const entries = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [String(name).toLowerCase(), String(value)])
  );
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get(name) {
        return entries[String(name).toLowerCase()] ?? null;
      }
    },
    async text() {
      return body == null ? '' : typeof body === 'string' ? body : JSON.stringify(body);
    }
  };
}

function makeHarness(options = {}) {
  const registered = [];
  const calls = [];
  const fetchCalls = [];
  const warnings = [];
  const errors = [];
  const endpoints = {
    production: {
      environment: 'production',
      paymentEndpoint: 'https://api.kgninja.dev/hyperxosist-query',
      paymentOptionsEndpoint: 'https://api.kgninja.dev/payment-options.json'
    },
    staging: {
      environment: 'staging',
      paymentEndpoint: 'https://staging.example/hyperxosist-query',
      paymentOptionsEndpoint: 'https://staging.example/payment-options.json'
    }
  };

  const dispatch =
    options.dispatch ||
    ((name, args) => {
      calls.push({ name, args });
      if (name === 'hyperxosist_build_paid_request') {
        const environment = args.paymentEnvironment || 'production';
        return {
          ok: true,
          result: {
            paymentRequired: true,
            endpoint: endpoints[environment].paymentEndpoint,
            paymentOptionsEndpoint: endpoints[environment].paymentOptionsEndpoint,
            expectedUnpaidStatus: 402,
            expectedPaidStatus: 200,
            body: args.input || {},
            preview: { query: 'preview' }
          }
        };
      }
      return { ok: true, result: { name, args, helper: () => 'not serializable output' } };
    });

  const fetchImpl =
    options.fetch ||
    (async (_url, _init) =>
      mockResponse(
        402,
        { error: 'payment_required', accepts: ['PAYMENT-SIGNATURE'] },
        { 'PAYMENT-REQUIRED': 'opaque-live-requirements', 'X-REQUEST-ID': 'req-test' }
      ));

  const sandbox = {
    console: {
      log() {},
      warn(...args) {
        warnings.push(args.join(' '));
      },
      error(...args) {
        errors.push(args.join(' '));
      }
    },
    document: options.unsupported
      ? {}
      : {
          modelContext: {
            registerTool(tool) {
              if (options.registrationFailure === tool.name) throw new Error('register failed');
              registered.push(tool);
            }
          }
        },
    HyperXosistAgent: options.missingAgent ? undefined : { dispatchToolCall: dispatch },
    HyperXosistPaymentEndpoints: options.missingPaymentEndpoints
      ? undefined
      : {
          defaultEnvironment: 'production',
          resolve(environment) {
            const selected = endpoints[String(environment || 'production').toLowerCase()];
            if (!selected) throw new Error('unknown environment');
            return selected;
          }
        },
    async fetch(url, init) {
      fetchCalls.push({ url, init });
      return fetchImpl(url, init);
    },
    AbortController,
    setTimeout,
    clearTimeout
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  return { sandbox, registered, calls, fetchCalls, warnings, errors };
}

function load(harness) {
  vm.runInContext(source, harness.sandbox, { filename: 'webmcp.js' });
}

function byName(harness, name) {
  return harness.registered.find((tool) => tool.name === name);
}

(async () => {
  await test('unsupported environment', async () => {
    const h = makeHarness({ unsupported: true });
    assert.doesNotThrow(() => load(h));
    assert.strictEqual(h.registered.length, 0);
  });

  await test('registers three free tools and one paid gateway', async () => {
    const h = makeHarness();
    load(h);
    assert.deepStrictEqual(
      h.registered.map((tool) => tool.name),
      [
        'hyperxosist_search_plan',
        'hyperxosist_filter_signals',
        'hyperxosist_build_handoff',
        'hyperxosist_execute'
      ]
    );
  });

  await test('the three free Site Tools remain read only', async () => {
    const h = makeHarness();
    load(h);
    h.registered.slice(0, 3).forEach((tool) => {
      assert.strictEqual(tool.annotations.readOnlyHint, true);
      assert.strictEqual(tool.annotations.openWorldHint, false);
      assert.strictEqual(tool.annotations.destructiveHint, false);
    });
  });

  await test('paid gateway advertises economic side effects', async () => {
    const h = makeHarness();
    load(h);
    const tool = byName(h, 'hyperxosist_execute');
    assert.strictEqual(tool.annotations.readOnlyHint, false);
    assert.strictEqual(tool.annotations.destructiveHint, true);
    assert.strictEqual(tool.annotations.idempotentHint, false);
    assert.strictEqual(tool.annotations.openWorldHint, true);
    assert.deepStrictEqual(tool.inputSchema.properties.confirmPaidExecution.enum, [
      'CONFIRM_X402_PAYMENT'
    ]);
  });

  await test('search plan mapping', async () => {
    const h = makeHarness();
    load(h);
    await byName(h, 'hyperxosist_search_plan').execute({ intent: 'Find Acme bugs', lang: 'en' });
    assert.strictEqual(h.calls[0].name, 'hyperxosist_plan_from_intent');
    assert.strictEqual(h.calls[0].args.intent, 'Find Acme bugs');
  });

  await test('filter mapping', async () => {
    const h = makeHarness();
    load(h);
    await byName(h, 'hyperxosist_filter_signals').execute({ signals: ['broken login'], minScore: 55 });
    assert.strictEqual(h.calls[0].name, 'hyperxosist_filter_keep_signals');
    assert.deepStrictEqual(h.calls[0].args.feedback, ['broken login']);
    assert.strictEqual(h.calls[0].args.minScore, 55);
  });

  await test('handoff mapping', async () => {
    const h = makeHarness();
    load(h);
    await byName(h, 'hyperxosist_build_handoff').execute({
      productName: 'Acme',
      feedback: ['broken login']
    });
    assert.strictEqual(h.calls[0].name, 'hyperxosist_build_handoff');
  });

  await test('requirements action obtains HTTP 402 terms without a payment header', async () => {
    const h = makeHarness();
    load(h);
    const result = await byName(h, 'hyperxosist_execute').execute({
      action: 'requirements',
      input: { keywords: 'Acme' }
    });
    assert.strictEqual(result.phase, 'payment_required');
    assert.strictEqual(result.status, 402);
    assert.strictEqual(result.paymentAccepted, false);
    assert.strictEqual(result.paymentHeaders.paymentRequired, 'opaque-live-requirements');
    assert.strictEqual(h.fetchCalls.length, 1);
    assert.strictEqual(h.fetchCalls[0].url, 'https://api.kgninja.dev/hyperxosist-query');
    assert.strictEqual(h.fetchCalls[0].init.headers['PAYMENT-SIGNATURE'], undefined);
  });

  await test('paid execute requires the exact explicit confirmation before dispatch or fetch', async () => {
    const h = makeHarness();
    load(h);
    await assert.rejects(
      () =>
        byName(h, 'hyperxosist_execute').execute({
          action: 'execute',
          input: { keywords: 'Acme' },
          paymentSignature: 'opaque-proof'
        }),
      /explicit confirmation/
    );
    assert.strictEqual(h.calls.length, 0);
    assert.strictEqual(h.fetchCalls.length, 0);
  });

  await test('paid execute submits only the opaque proof and never echoes it', async () => {
    const h = makeHarness({
      fetch: async () =>
        mockResponse(
          200,
          { query: 'Acme -spam', searchUrl: 'https://x.com/search?q=Acme' },
          { 'PAYMENT-RESPONSE': 'settled', 'X-REQUEST-ID': 'req-paid' }
        )
    });
    load(h);
    const result = await byName(h, 'hyperxosist_execute').execute({
      action: 'execute',
      input: { keywords: 'Acme' },
      paymentSignature: 'opaque-proof',
      confirmPaidExecution: 'CONFIRM_X402_PAYMENT'
    });
    assert.strictEqual(result.phase, 'executed');
    assert.strictEqual(result.paymentAccepted, true);
    assert.strictEqual(h.fetchCalls[0].init.headers['PAYMENT-SIGNATURE'], 'opaque-proof');
    assert.ok(!JSON.stringify(result).includes('opaque-proof'));
    assert.strictEqual(result.paymentHeaders.paymentResponse, 'settled');
  });

  await test('legacy X-PAYMENT header is allowed only by explicit enum choice', async () => {
    const h = makeHarness({ fetch: async () => mockResponse(200, { ok: true }) });
    load(h);
    await byName(h, 'hyperxosist_execute').execute({
      action: 'execute',
      input: { keywords: 'Acme' },
      paymentHeader: 'X-PAYMENT',
      paymentSignature: 'opaque-proof',
      confirmPaidExecution: 'CONFIRM_X402_PAYMENT'
    });
    assert.strictEqual(h.fetchCalls[0].init.headers['X-PAYMENT'], 'opaque-proof');
  });

  await test('user-supplied endpoints cannot override the trusted registry', async () => {
    const h = makeHarness();
    load(h);
    await byName(h, 'hyperxosist_execute').execute({
      action: 'requirements',
      input: { keywords: 'Acme' },
      endpoint: 'https://evil.example/steal'
    });
    assert.strictEqual(h.fetchCalls[0].url, 'https://api.kgninja.dev/hyperxosist-query');
  });

  await test('wallet and signing secret fields are rejected before network access', async () => {
    const h = makeHarness();
    load(h);
    await assert.rejects(
      () =>
        byName(h, 'hyperxosist_execute').execute({
          action: 'execute',
          input: { keywords: 'Acme', privateKey: 'never-send-this' },
          paymentSignature: 'opaque-proof',
          confirmPaidExecution: 'CONFIRM_X402_PAYMENT'
        }),
      /secrets are not accepted/
    );
    assert.strictEqual(h.fetchCalls.length, 0);
  });

  await test('payment signature header injection is rejected', async () => {
    const h = makeHarness();
    load(h);
    await assert.rejects(
      () =>
        byName(h, 'hyperxosist_execute').execute({
          action: 'execute',
          input: { keywords: 'Acme' },
          paymentSignature: 'proof\r\nX-Evil: yes',
          confirmPaidExecution: 'CONFIRM_X402_PAYMENT'
        }),
      /single HTTP header value/
    );
    assert.strictEqual(h.fetchCalls.length, 0);
  });

  await test('requirements action refuses to leak a supplied payment proof', async () => {
    const h = makeHarness();
    load(h);
    await assert.rejects(
      () =>
        byName(h, 'hyperxosist_execute').execute({
          action: 'requirements',
          input: { keywords: 'Acme' },
          paymentSignature: 'should-not-be-sent'
        }),
      /Do not send paymentSignature/
    );
    assert.strictEqual(h.fetchCalls.length, 0);
  });

  await test('unsigned 200 response is treated as a policy failure', async () => {
    const h = makeHarness({ fetch: async () => mockResponse(200, { bypass: true }) });
    load(h);
    await assert.rejects(
      () =>
        byName(h, 'hyperxosist_execute').execute({
          action: 'requirements',
          input: { keywords: 'Acme' }
        }),
      /unsigned request/
    );
  });

  await test('dispatcher failure', async () => {
    const h = makeHarness({
      dispatch() {
        return { ok: false, message: 'controlled failure' };
      }
    });
    load(h);
    await assert.rejects(
      () => byName(h, 'hyperxosist_search_plan').execute({ intent: 'test' }),
      /controlled failure/
    );
  });

  await test('serializable free result', async () => {
    const h = makeHarness();
    load(h);
    const result = await byName(h, 'hyperxosist_search_plan').execute({ intent: 'test' });
    assert.doesNotThrow(() => JSON.stringify(result));
    assert.strictEqual(typeof result.helper, 'undefined');
  });

  await test('duplicate initialization', async () => {
    const h = makeHarness();
    load(h);
    load(h);
    assert.strictEqual(h.registered.length, 4);
  });

  await test('pre-aborted free execution is rejected cleanly', async () => {
    const h = makeHarness();
    load(h);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      () => byName(h, 'hyperxosist_search_plan').execute({ intent: 'test' }, { signal: controller.signal }),
      (error) => error && error.name === 'AbortError'
    );
    assert.strictEqual(h.calls.length, 0);
  });

  await test('pre-aborted paid execution performs no dispatch or fetch', async () => {
    const h = makeHarness();
    load(h);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      () =>
        byName(h, 'hyperxosist_execute').execute(
          { action: 'requirements', input: { keywords: 'Acme' } },
          { signal: controller.signal }
        ),
      (error) => error && error.name === 'AbortError'
    );
    assert.strictEqual(h.calls.length, 0);
    assert.strictEqual(h.fetchCalls.length, 0);
  });

  await test('missing payment registry affects only paid execution', async () => {
    const h = makeHarness({ missingPaymentEndpoints: true });
    load(h);
    assert.strictEqual(h.registered.length, 4);
    await assert.rejects(
      () =>
        byName(h, 'hyperxosist_execute').execute({
          action: 'requirements',
          input: { keywords: 'Acme' }
        }),
      /registry is unavailable/
    );
    const plan = await byName(h, 'hyperxosist_search_plan').execute({ intent: 'test' });
    assert.strictEqual(plan.name, 'hyperxosist_plan_from_intent');
  });

  await test('missing agent skips registration without throwing', async () => {
    const h = makeHarness({ missingAgent: true });
    assert.doesNotThrow(() => load(h));
    assert.strictEqual(h.registered.length, 0);
    assert.strictEqual(h.warnings.length, 1);
  });

  await test('one registration failure does not break later tools', async () => {
    const h = makeHarness({ registrationFailure: 'hyperxosist_filter_signals' });
    assert.doesNotThrow(() => load(h));
    assert.deepStrictEqual(
      h.registered.map((tool) => tool.name),
      ['hyperxosist_search_plan', 'hyperxosist_build_handoff', 'hyperxosist_execute']
    );
    assert.strictEqual(h.errors.length, 1);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
'''


ACCESS_POLICY_TEST = r'''/**
 * Cross-manifest access-boundary regression test.
 */
'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const expectedFree = [
  'hyperxosist_search_plan',
  'hyperxosist_filter_signals',
  'hyperxosist_build_handoff'
];
const expectedPaid = ['hyperxosist_execute'];
const paidEndpoint = 'https://api.kgninja.dev/hyperxosist-query';

const policy = readJson('access-policy.json');
const agentUse = readJson('agent-use.json');
const agentTools = readJson('agent-tools.json');
const wellKnown = readJson('.well-known/mcp.json');
const catalog = readJson('mcp-catalog.json');
const x402 = readJson('x402-payment.json');
const pkg = readJson('package.json');
const webmcp = fs.readFileSync(path.join(root, 'webmcp.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

assert.strictEqual(agentUse.requiresPaymentForAgentUse, false);
assert.strictEqual(agentUse.requiresPaymentForProductionExecution, true);
assert.strictEqual(agentTools.requiresPaymentForAgentUse, false);
assert.strictEqual(agentTools.requiresPaymentForProductionExecution, true);
assert.deepStrictEqual(agentUse.siteTools.freeTools, expectedFree);
assert.deepStrictEqual(agentUse.siteTools.paidTools, expectedPaid);
assert.deepStrictEqual(agentTools.siteTools.freeTools, expectedFree);
assert.deepStrictEqual(agentTools.siteTools.paidTools, expectedPaid);
assert.deepStrictEqual(policy.surfaces.webMcp.freeTools, expectedFree);
assert.deepStrictEqual(policy.surfaces.webMcp.paidTools, expectedPaid);
assert.strictEqual(policy.x402.endpoint, paidEndpoint);
assert.strictEqual(x402.paymentEndpoint, paidEndpoint);
assert.strictEqual(wellKnown.paidExecution.endpoint, paidEndpoint);
assert.strictEqual(catalog.paidExecution.endpoint, paidEndpoint);
assert.strictEqual(wellKnown.authentication, 'none');
assert.strictEqual(catalog.server.authentication, 'none');
assert.strictEqual(agentUse.remoteMcp.authentication, 'none');
assert.strictEqual(wellKnown.authenticationRequired, false);
assert.strictEqual(catalog.server.authenticationRequired, false);
assert.strictEqual(agentUse.remoteMcp.authenticationRequired, false);
assert.strictEqual(policy.surfaces.webMcp.acceptsWalletSecrets, false);
assert.strictEqual(policy.surfaces.webMcp.explicitConfirmationRequired, true);
assert.ok(webmcp.includes("name: PAID_TOOL_NAME"));
assert.ok(webmcp.includes("CONFIRM_X402_PAYMENT"));
assert.ok(index.includes('hyperxosist_execute'));
assert.ok(pkg.files.includes('access-policy.json'));

console.log('Access policy consistency tests passed.');
'''


ACCESS_POLICY = {
    "schemaVersion": "1.0",
    "service": "HyperXosist-Agent",
    "version": VERSION_NEW,
    "sourceOfTruth": "https://api.kgninja.dev/openapi.json",
    "publicSite": "https://kg-ninja.github.io/HyperXosist-Agent/",
    "surfaces": {
        "humanUi": {
            "authentication": "none",
            "paymentRequired": False,
            "description": "Manual browser search and local UI remain free."
        },
        "webMcp": {
            "transport": "document.modelContext",
            "authentication": "none",
            "freeTools": [
                "hyperxosist_search_plan",
                "hyperxosist_filter_signals",
                "hyperxosist_build_handoff"
            ],
            "paidTools": ["hyperxosist_execute"],
            "twoStepExecution": [
                "requirements: unsigned POST receives live HTTP 402 terms",
                "execute: explicit approval plus opaque payment proof retries the trusted endpoint"
            ],
            "acceptsWalletSecrets": False,
            "explicitConfirmationRequired": True,
            "confirmationLiteral": "CONFIRM_X402_PAYMENT",
            "trustedPaymentVerifier": "https://api.kgninja.dev/hyperxosist-query"
        },
        "remoteMcp": {
            "endpoint": "https://mcp.kgninja.dev/mcp",
            "authentication": "none",
            "authenticationRequired": False,
            "accessMode": "public-free",
            "freeTools": [
                "hyperxosist_search_plan",
                "hyperxosist_filter_signals",
                "hyperxosist_build_handoff"
            ],
            "privateOrSelfHostedAuthentication": "bearer"
        }
    },
    "x402": {
        "protocol": "x402",
        "version": 2,
        "endpoint": "https://api.kgninja.dev/hyperxosist-query",
        "paymentOptions": "https://api.kgninja.dev/payment-options.json",
        "network": "eip155:8453",
        "networkName": "Base",
        "settlementAsset": "USDC",
        "advertisedAmount": "0.01",
        "liveTermsAreAuthoritative": True,
        "expectedUnpaidStatus": 402,
        "expectedPaidStatus": 200,
        "scope": "automated production execution only"
    },
    "globalPolicy": {
        "requiresPaymentForAgentUse": False,
        "requiresPaymentForProductionExecution": True,
        "mustNotBypassPayment": True,
        "mustNeverRequestPrivateKeysOrSeedPhrases": True
    }
}


# Replace browser adapter and its focused tests.
_, webmcp_nl = read_preserved("webmcp.js")
write_preserved("webmcp.js", WEBMCP_JS, webmcp_nl)
_, webmcp_test_nl = read_preserved("test/webmcp.test.js")
write_preserved("test/webmcp.test.js", WEBMCP_TEST, webmcp_test_nl)
write_preserved("test/access-policy-consistency.test.js", ACCESS_POLICY_TEST, "\n")
write_preserved("access-policy.json", json.dumps(ACCESS_POLICY, ensure_ascii=False, indent=2) + "\n", "\n")


# Version and machine-readable package surface.
pkg, pkg_nl = load_json("package.json")
pkg["version"] = VERSION_NEW
if "access-policy.json" not in pkg.get("files", []):
    insert_at = pkg["files"].index("x402-payment.json") + 1 if "x402-payment.json" in pkg["files"] else len(pkg["files"])
    pkg["files"].insert(insert_at, "access-policy.json")
pkg.setdefault("scripts", {})["test:access-policy"] = "node test/access-policy-consistency.test.js"
if "node test/access-policy-consistency.test.js" not in pkg["scripts"]["test"]:
    pkg["scripts"]["test"] += " && node test/access-policy-consistency.test.js"
write_json("package.json", pkg, pkg_nl)

lock, lock_nl = load_json("package-lock.json")
lock["version"] = VERSION_NEW
if "" in lock.get("packages", {}):
    lock["packages"][""]["version"] = VERSION_NEW
write_json("package-lock.json", lock, lock_nl)


agent_use, agent_use_nl = load_json("agent-use.json")
agent_use["version"] = VERSION_NEW
agent_use["requiresPaymentForAgentUse"] = False
agent_use["requiresPaymentForProductionExecution"] = True
agent_use["requiresAuthenticationForPublicRemoteMcp"] = False
agent_use["accessPolicyManifest"] = "access-policy.json"
remote = agent_use.setdefault("remoteMcp", {})
remote["authentication"] = "none"
remote["accessMode"] = "public-free"
remote["authenticationRequired"] = False
remote["publicFreeAccess"] = True
remote["privateOrSelfHostedAuthentication"] = "bearer"
remote["paymentRequiredForFreeOperations"] = False
remote["accessPolicy"] = "https://kg-ninja.github.io/HyperXosist-Agent/access-policy.json"
entrypoints = agent_use.setdefault("entrypoints", {})
entrypoints["accessPolicy"] = "access-policy.json"
entrypoints["siteToolsAdapter"] = "webmcp.js"
agent_use["agentUsePolicy"] = {
    "humanBrowserUse": "free",
    "aiAgentUse": "free for discovery, planning, filtering, and handoff; x402 required for automated production execution",
    "mustNotBypassPayment": True,
    "paymentVerifier": "https://api.kgninja.dev/hyperxosist-query",
    "localPlanningAllowed": True,
    "publicRemoteMcpAuthentication": "none",
    "requiresPaymentForAgentUse": False,
    "requiresPaymentForProductionExecution": True,
    "mustNotBypassPaymentScope": "automated-production-execution-only"
}
agent_use["siteTools"] = {
    "transport": "WebMCP document.modelContext",
    "authentication": "none",
    "freeTools": [
        "hyperxosist_search_plan",
        "hyperxosist_filter_signals",
        "hyperxosist_build_handoff"
    ],
    "paidTools": ["hyperxosist_execute"],
    "paidToolProtocol": "x402-v2",
    "paidToolEndpoint": "https://api.kgninja.dev/hyperxosist-query",
    "explicitConfirmationRequired": True,
    "acceptsWalletSecrets": False
}
write_json("agent-use.json", agent_use, agent_use_nl)

agent_tools, agent_tools_nl = load_json("agent-tools.json")
agent_tools["version"] = VERSION_NEW
agent_tools["requiresPaymentForAgentUse"] = False
agent_tools["requiresPaymentForProductionExecution"] = True
agent_tools["accessPolicyManifest"] = "access-policy.json"
remote_tools = agent_tools.setdefault("remoteMcp", {})
remote_tools["authentication"] = "none"
remote_tools["accessMode"] = "public-free"
remote_tools["authenticationRequired"] = False
remote_tools["publicFreeAccess"] = True
remote_tools["privateOrSelfHostedAuthentication"] = "bearer"
remote_tools["paymentRequiredForFreeOperations"] = False
agent_tools["siteTools"] = {
    "transport": "WebMCP document.modelContext",
    "authentication": "none",
    "freeTools": [
        "hyperxosist_search_plan",
        "hyperxosist_filter_signals",
        "hyperxosist_build_handoff"
    ],
    "paidTools": ["hyperxosist_execute"],
    "paidTool": {
        "protocol": "x402-v2",
        "endpoint": "https://api.kgninja.dev/hyperxosist-query",
        "actions": ["requirements", "execute"],
        "explicitConfirmation": "CONFIRM_X402_PAYMENT",
        "acceptsWalletSecrets": False
    }
}
write_json("agent-tools.json", agent_tools, agent_tools_nl)

x402, x402_nl = load_json("x402-payment.json")
x402["serviceVersion"] = VERSION_NEW
x402["status"] = "payment-required-for-production-execution"
x402["scope"] = "automated-production-execution-only"
x402["requiresPaymentForAgentUse"] = False
x402["requiresPaymentForProductionExecution"] = True
x402["webMcpPaidTool"] = {
    "name": "hyperxosist_execute",
    "adapter": "webmcp.js",
    "actions": ["requirements", "execute"],
    "explicitConfirmation": "CONFIRM_X402_PAYMENT",
    "acceptsWalletSecrets": False,
    "paymentProofTreatment": "opaque-header-value-only"
}
write_json("x402-payment.json", x402, x402_nl)

well_known, well_known_nl = load_json(".well-known/mcp.json")
well_known["version"] = VERSION_NEW
well_known["authentication"] = "none"
well_known["accessMode"] = "public-free"
well_known["authenticationRequired"] = False
well_known["publicFreeAccess"] = True
well_known["privateOrSelfHostedAuthentication"] = "bearer"
well_known.setdefault("paidExecution", {})["authentication"] = "x402-payment-proof"
well_known["paidExecution"]["paymentRequired"] = True
well_known["siteTools"] = {
    "transport": "WebMCP document.modelContext",
    "freeTools": [
        "hyperxosist_search_plan",
        "hyperxosist_filter_signals",
        "hyperxosist_build_handoff"
    ],
    "paidTools": ["hyperxosist_execute"],
    "paidToolEndpoint": "https://api.kgninja.dev/hyperxosist-query",
    "accessPolicy": "https://kg-ninja.github.io/HyperXosist-Agent/access-policy.json"
}
write_json(".well-known/mcp.json", well_known, well_known_nl)

catalog, catalog_nl = load_json("mcp-catalog.json")
catalog["version"] = VERSION_NEW
server = catalog.setdefault("server", {})
server["authentication"] = "none"
server["accessMode"] = "public-free"
server["authenticationRequired"] = False
server["publicFreeAccess"] = True
server["privateOrSelfHostedAuthentication"] = "bearer"
catalog.setdefault("paidExecution", {})["authentication"] = "x402-payment-proof"
catalog["paidExecution"]["paymentRequired"] = True
catalog["siteTools"] = {
    "transport": "document.modelContext",
    "freeTools": [
        "hyperxosist_search_plan",
        "hyperxosist_filter_signals",
        "hyperxosist_build_handoff"
    ],
    "paidTools": ["hyperxosist_execute"],
    "accessPolicy": "https://kg-ninja.github.io/HyperXosist-Agent/access-policy.json"
}
write_json("mcp-catalog.json", catalog, catalog_nl, compact=True)


# Agent runtime advertises a free agent-use surface and a paid production boundary.
agent_api, agent_api_nl = read_preserved("agent-api.js")
agent_api = agent_api.replace("HyperXosist Agent API v2.4.0", "HyperXosist Agent API v2.6.0", 1)
agent_api = replace_once(
    agent_api,
    "  const VERSION = '2.5.0';",
    "  const VERSION = '2.6.0';",
    "agent-api VERSION"
)
agent_api = replace_once(
    agent_api,
    "    version: VERSION,\n    paymentRequired: true,\n    agentUseRequiresPayment: true,\n    paymentManifest: 'x402-payment.json',",
    "    version: VERSION,\n    paymentRequired: true,\n    agentUseRequiresPayment: false,\n    productionExecutionRequiresPayment: true,\n    paymentRequiredScope: 'automated-production-execution-only',\n    paymentManifest: 'x402-payment.json',",
    "agent-api payment boundary"
)
write_preserved("agent-api.js", agent_api, agent_api_nl)


# Public UI: clearly separate free discovery from the paid Site Tool.
index, index_nl = read_preserved("index.html")
index = index.replace(VERSION_OLD, VERSION_NEW)
site_section = '''        <!-- ChatGPT Site Tools / WebMCP -->
        <section class="agent-section" aria-labelledby="siteToolsTitle">
          <h2 id="siteToolsTitle">ChatGPT Site Tools <span class="pill">WebMCP</span></h2>
          <p>
            対応環境では、無料・read-only の <code>hyperxosist_search_plan</code> /
            <code>hyperxosist_filter_signals</code> / <code>hyperxosist_build_handoff</code> を
            ページ上の Site Tools として利用できます。
          </p>
          <p>
            本番実行だけは第4ツール <code>hyperxosist_execute</code> が既存x402 Workerへ接続します。
            まず <code>action=requirements</code> でHTTP 402の最新条件を取得し、利用者が条件を承認して
            外部ウォレットが不透明な支払い証明を生成した後だけ、<code>action=execute</code> を実行します。
          </p>
          <p>
            Site Toolは秘密鍵、シードフレーズ、mnemonic、ウォレット秘密情報を受け取りません。
            実行先は <code>https://api.kgninja.dev/hyperxosist-query</code> に固定され、
            <code>CONFIRM_X402_PAYMENT</code> の明示確認が必要です。詳細は
            <a href="access-policy.json"><code>access-policy.json</code></a>。
          </p>
        </section>
'''
pattern = re.compile(
    r"        <!-- ChatGPT Site Tools / WebMCP -->.*?(?=\n        <!-- Remote MCP production -->)",
    re.S,
)
if not pattern.search(index):
    raise RuntimeError("index Site Tools section not found")
index = pattern.sub(site_section.rstrip("\n"), index, count=1)
index = index.replace(
    "<dt>Authentication</dt><dd>Bearer token</dd>",
    "<dt>Public authentication</dt><dd>None</dd>\n            <dt>Private/self-hosted mode</dt><dd>Optional Bearer token</dd>",
    1,
)
index = index.replace(
    '<a href="signal-to-fix-pipeline.json">Signal-to-Fix pipeline</a>',
    '<a href="signal-to-fix-pipeline.json">Signal-to-Fix pipeline</a> ·\n        <a href="access-policy.json">Access policy</a>',
    1,
)
write_preserved("index.html", index, index_nl)


# Documentation updates.
readme, readme_nl = read_preserved("README.md")
readme = readme.replace(VERSION_OLD, VERSION_NEW)
webmcp_readme = '''## ChatGPT Site Tools / WebMCP

The page registers four WebMCP Site Tools when `document.modelContext` is available.

- Free/read-only: `hyperxosist_search_plan`, `hyperxosist_filter_signals`, `hyperxosist_build_handoff`.
- x402 production gateway: `hyperxosist_execute`.

`hyperxosist_execute` is deliberately two-step. Call `action: "requirements"` without payment material to obtain the live HTTP 402 terms. After the operator reviews those terms and an external wallet creates an opaque x402 proof, call `action: "execute"` with `confirmPaidExecution: "CONFIRM_X402_PAYMENT"`. The browser adapter pins the request to the endpoint registry, omits credentials/referrers, blocks redirects, rejects secret-like fields, and never returns the payment proof.

Do not provide a private key, seed phrase, mnemonic, wallet secret, or signing key. The Site Tool does not sign transactions. The existing x402 Worker remains the payment verifier and settlement boundary. See [`access-policy.json`](access-policy.json) and [`x402-payment.json`](x402-payment.json).
'''
readme_pattern = re.compile(r"## ChatGPT Site Tools / WebMCP\n.*?(?=\n## )", re.S)
if readme_pattern.search(readme):
    readme = readme_pattern.sub(webmcp_readme.rstrip("\n"), readme, count=1)
else:
    insert = readme.find("\n## ")
    if insert < 0:
        readme += "\n\n" + webmcp_readme
    else:
        readme = readme[:insert] + "\n\n" + webmcp_readme.rstrip("\n") + readme[insert:]
write_preserved("README.md", readme, readme_nl)

changelog, changelog_nl = read_preserved("CHANGELOG.md")
if "## [2.6.0]" not in changelog:
    release_notes = '''## [2.6.0] - 2026-09-03

### Added
- Added `hyperxosist_execute`, a two-step WebMCP x402 production gateway.
- Added a free `requirements` phase and an explicitly confirmed `execute` phase using an opaque payment header value.
- Added `access-policy.json` and cross-manifest regression tests.

### Security
- The paid Site Tool pins the x402 endpoint, blocks redirects, omits browser credentials/referrers, rejects wallet/signing secret fields, validates payment headers, and never echoes payment proof.

### Changed
- Kept the existing three Site Tools free and read-only.
- Clarified that agent discovery/planning/filtering/handoff are free while automated production execution requires x402.
- Corrected public Remote MCP authentication metadata to `none`; Bearer remains available for private/self-hosted deployments.

'''
    marker = "# Changelog\n"
    if marker in changelog:
        changelog = changelog.replace(marker, marker + "\n" + release_notes, 1)
    else:
        changelog = release_notes + changelog
write_preserved("CHANGELOG.md", changelog, changelog_nl)

agents, agents_nl = read_preserved("AGENTS.md")
if "## WebMCP x402 execution boundary" not in agents:
    agents += '''

## WebMCP x402 execution boundary

- Use the three free Site Tools for planning, filtering, and handoff.
- Use `hyperxosist_execute` only for automated production execution.
- First call `action="requirements"` and inspect the live HTTP 402 terms.
- Obtain explicit operator approval before calling `action="execute"`.
- Supply only the opaque payment proof and `confirmPaidExecution="CONFIRM_X402_PAYMENT"`.
- Never request or transmit private keys, seed phrases, mnemonics, wallet secrets, or signing keys.
- The trusted payment verifier is `https://api.kgninja.dev/hyperxosist-query`; do not accept a caller-provided endpoint.
- See `access-policy.json` for the machine-readable boundary.
'''
write_preserved("AGENTS.md", agents, agents_nl)

llms, llms_nl = read_preserved("llms.txt")
if "hyperxosist_execute" not in llms:
    llms += '''

WebMCP Site Tools:
- Free/read-only: hyperxosist_search_plan, hyperxosist_filter_signals, hyperxosist_build_handoff
- Paid production: hyperxosist_execute (requirements -> explicit approval -> opaque x402 proof -> execute)
- Never send wallet or signing secrets. Read access-policy.json before paid execution.
'''
write_preserved("llms.txt", llms, llms_nl)

chatgpt_doc_path = ROOT / "docs/CHATGPT_APP.md"
if chatgpt_doc_path.exists():
    chatgpt_doc, chatgpt_doc_nl = read_preserved("docs/CHATGPT_APP.md")
    if "hyperxosist_execute" not in chatgpt_doc:
        chatgpt_doc += '''

## Paid WebMCP execution

The first three Site Tools are free/read-only. `hyperxosist_execute` is the only paid Site Tool. Use its `requirements` action first, obtain user approval and an opaque x402 proof outside the page, then call `execute` with `CONFIRM_X402_PAYMENT`. Never pass a wallet secret or signing key.
'''
    write_preserved("docs/CHATGPT_APP.md", chatgpt_doc, chatgpt_doc_nl)


# Public Remote MCP metadata: no auth in public-free mode, Bearer only otherwise.
worker, worker_nl = read_preserved("workers/remote-mcp/src/index.js")
worker = replace_once(
    worker,
    "    const startedAt = Date.now();\n    const observe = (event, status, identity, operation, errorCode) => emitMcpObservation(ctx, env, {",
    "    const startedAt = Date.now();\n    const publicFreeAccess = String(env.HYPERXOSIST_MCP_PUBLIC_FREE_ACCESS || '').toLowerCase() === 'true';\n    const observe = (event, status, identity, operation, errorCode) => emitMcpObservation(ctx, env, {",
    "worker public access declaration"
)
worker = replace_once(
    worker,
    "        authentication: 'public-free',",
    "        authentication: publicFreeAccess ? 'none' : 'bearer',\n        accessMode: publicFreeAccess ? 'public-free' : 'private-authenticated',\n        authenticationRequired: !publicFreeAccess,\n        publicFreeAccess,\n        privateOrSelfHostedAuthentication: 'bearer',",
    "worker discovery authentication"
)
worker = replace_once(
    worker,
    "          network: 'eip155:8453',\n        },",
    "          network: 'eip155:8453',\n          authentication: 'x402-payment-proof',\n          paymentRequired: true,\n        },",
    "worker paid execution metadata"
)
worker = replace_once(
    worker,
    "        publicFreeAccess: String(env.HYPERXOSIST_MCP_PUBLIC_FREE_ACCESS || \"\").toLowerCase() === \"true\",",
    "        publicFreeAccess,\n        accessMode: publicFreeAccess ? 'public-free' : 'private-authenticated',\n        authentication: publicFreeAccess ? 'none' : 'bearer',\n        authenticationRequired: !publicFreeAccess,",
    "worker health authentication"
)
worker = replace_once(
    worker,
    "    const publicFreeAccess = String(env.HYPERXOSIST_MCP_PUBLIC_FREE_ACCESS || \"\").toLowerCase() === \"true\";\n    if (!publicFreeAccess && !env.HYPERXOSIST_MCP_TOKEN && !env.HYPERXOSIST_MCP_TOKEN_USERS) {",
    "    if (!publicFreeAccess && !env.HYPERXOSIST_MCP_TOKEN && !env.HYPERXOSIST_MCP_TOKEN_USERS) {",
    "worker duplicate public access declaration"
)
write_preserved("workers/remote-mcp/src/index.js", worker, worker_nl)

cloudflare_test, cloudflare_test_nl = read_preserved("test/mcp-cloudflare-worker.test.mjs")
if "public-free discovery advertises no authentication" not in cloudflare_test:
    addition = r'''

test('public-free discovery advertises no authentication and external x402 execution', async () => {
  const publicEnv = { ...env, HYPERXOSIST_MCP_PUBLIC_FREE_ACCESS: 'true' };
  const discovery = await worker.fetch(request('/.well-known/mcp.json', { method: 'GET' }), publicEnv);
  assert.equal(discovery.status, 200);
  const metadata = await discovery.json();
  assert.equal(metadata.authentication, 'none');
  assert.equal(metadata.authenticationRequired, false);
  assert.equal(metadata.publicFreeAccess, true);
  assert.equal(metadata.paidExecution.authentication, 'x402-payment-proof');
  assert.equal(metadata.paidExecution.paymentRequired, true);

  const health = await worker.fetch(request('/health', { method: 'GET' }), publicEnv);
  const healthBody = await health.json();
  assert.equal(healthBody.authentication, 'none');
  assert.equal(healthBody.authenticationRequired, false);
});
'''
    cloudflare_test += addition
write_preserved("test/mcp-cloudflare-worker.test.mjs", cloudflare_test, cloudflare_test_nl)


# Final machine validation before the workflow runs the test suites.
for file_name in [
    "access-policy.json",
    "agent-use.json",
    "agent-tools.json",
    ".well-known/mcp.json",
    "mcp-catalog.json",
    "x402-payment.json",
    "package.json",
    "package-lock.json",
]:
    json.loads((ROOT / file_name).read_text(encoding="utf-8"))

print("WebMCP x402 paid execution implementation applied.")
