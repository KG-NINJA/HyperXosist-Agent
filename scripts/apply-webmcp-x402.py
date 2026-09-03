#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION_OLD = "2.5.0"
VERSION_NEW = "2.6.0"
TODAY = "2026-09-03"


def path(rel: str) -> Path:
    return ROOT / rel


def detect_newline(data: bytes) -> str:
    return "\r\n" if data.count(b"\r\n") > max(0, data.count(b"\n") // 2) else "\n"


def read_preserved(rel: str) -> tuple[str, str]:
    data = path(rel).read_bytes()
    # Normalize internally so exact semantic replacements work for LF, CRLF,
    # or mixed-line-ending repository files. write_preserved restores the
    # original dominant newline style.
    text = data.decode("utf-8-sig").replace("\r\n", "\n").replace("\r", "\n")
    return text, detect_newline(data)


def write_preserved(rel: str, text: str, newline: str | None = None) -> None:
    target = path(rel)
    target.parent.mkdir(parents=True, exist_ok=True)
    if newline == "\r\n":
        text = text.replace("\r\n", "\n").replace("\n", "\r\n")
    else:
        text = text.replace("\r\n", "\n")
    target.write_bytes(text.encode("utf-8"))


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def append_before_final_brace(text: str, fragment: str, label: str) -> str:
    stripped = text.rstrip()
    if not stripped.endswith("}"):
        raise RuntimeError(f"{label}: missing final object brace")
    prefix = stripped[:-1].rstrip()
    separator = "," if not prefix.endswith("{") else ""
    return prefix + separator + "\n" + fragment.rstrip() + "\n}\n"


def load_json_preserved(rel: str) -> tuple[dict, str]:
    text, newline = read_preserved(rel)
    return json.loads(text), newline


def dump_json_preserved(rel: str, data: dict, newline: str, compact: bool = False) -> None:
    if compact:
        rendered = json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n"
    else:
        rendered = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    write_preserved(rel, rendered, newline)


PAID_EXECUTION_JS = r"""'use strict';

/**
 * Shared x402 execution bridge for browser Site Tools and MCP adapters.
 *
 * This module never creates or stores wallet keys. It performs the existing
 * HyperXosist paid HTTP request, surfaces PAYMENT-REQUIRED on 402, and accepts
 * an opaque x402 V2 PAYMENT-SIGNATURE for an explicitly confirmed retry.
 */
(function exposePaidExecution(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HyperXosistPaidExecution = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPaidExecution(root) {
  const VERSION = '1.0.0';
  const TYPE = 'hyperxosist.x402_execution.v1';
  const MAX_PAYMENT_SIGNATURE_LENGTH = 65536;
  const DEFAULT_TIMEOUT_MS = 30000;
  const HEADER_NAMES = Object.freeze({
    paymentRequired: 'PAYMENT-REQUIRED',
    paymentSignature: 'PAYMENT-SIGNATURE',
    paymentResponse: 'PAYMENT-RESPONSE'
  });

  const PaymentEndpoints =
    (root && root.HyperXosistPaymentEndpoints) ||
    (typeof module === 'object' && module.exports ? require('./payment-endpoints.js') : null);

  function resolvePayment(options) {
    if (!PaymentEndpoints || typeof PaymentEndpoints.resolve !== 'function') {
      return null;
    }
    const opts = options || {};
    return PaymentEndpoints.resolve(opts.paymentEnvironment || 'production');
  }

  function safeHeader(headers, name) {
    if (!headers || typeof headers.get !== 'function') return null;
    const value = headers.get(name);
    return value == null || value === '' ? null : String(value);
  }

  function decodeBase64Json(value) {
    if (!value || typeof value !== 'string') return null;
    try {
      const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
      let jsonText;
      if (typeof atob === 'function') {
        const binary = atob(padded);
        const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
        jsonText = new TextDecoder().decode(bytes);
      } else {
        jsonText = Buffer.from(padded, 'base64').toString('utf8');
      }
      return JSON.parse(jsonText);
    } catch (_error) {
      return null;
    }
  }

  function normalizeSignature(value) {
    if (value == null || value === '') return { ok: true, value: null };
    if (typeof value !== 'string') {
      return { ok: false, code: 'invalid_payment_signature', message: 'paymentSignature must be a string.' };
    }
    const signature = value.trim();
    if (!signature) {
      return { ok: false, code: 'invalid_payment_signature', message: 'paymentSignature must not be empty.' };
    }
    if (/[\r\n]/.test(signature)) {
      return { ok: false, code: 'invalid_payment_signature', message: 'paymentSignature must not contain line breaks.' };
    }
    if (signature.length > MAX_PAYMENT_SIGNATURE_LENGTH) {
      return { ok: false, code: 'invalid_payment_signature', message: 'paymentSignature is too large.' };
    }
    if (!/^[A-Za-z0-9+/_=-]+$/.test(signature)) {
      return {
        ok: false,
        code: 'invalid_payment_signature',
        message: 'paymentSignature must be an opaque Base64 or Base64URL x402 payload.'
      };
    }
    return { ok: true, value: signature };
  }

  function baseResult(payment) {
    return {
      type: TYPE,
      version: VERSION,
      accessTier: 'paid',
      endpoint: payment ? payment.paymentEndpoint : null,
      paymentOptionsEndpoint: payment ? payment.paymentOptionsEndpoint : null,
      canonicalOpenApi: payment ? `${payment.baseUrl}/openapi.json` : null,
      x402: {
        version: 2,
        scheme: 'exact',
        network: 'eip155:8453',
        networkName: 'Base',
        asset: 'USDC',
        amount: '0.01',
        requestHeader: HEADER_NAMES.paymentRequired,
        signatureHeader: HEADER_NAMES.paymentSignature,
        responseHeader: HEADER_NAMES.paymentResponse
      }
    };
  }

  function failed(payment, code, message, extra) {
    return Object.assign(baseResult(payment), {
      ok: false,
      stage: 'failed',
      status: 0,
      paid: false,
      paymentRequired: false,
      error: { code, message }
    }, extra || {});
  }

  function validInput(input) {
    return input && typeof input === 'object' && !Array.isArray(input);
  }

  async function readResponseBody(response) {
    if (!response || typeof response.text !== 'function') return null;
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (_error) {
      return { text };
    }
  }

  function createAbortState(externalSignal, timeoutMs) {
    const Controller = root && root.AbortController ? root.AbortController : typeof AbortController !== 'undefined' ? AbortController : null;
    if (!Controller) return { signal: externalSignal || undefined, cleanup() {} };

    const controller = new Controller();
    let timer = null;
    let abortListener = null;

    if (externalSignal && typeof externalSignal.addEventListener === 'function') {
      abortListener = function () {
        try {
          controller.abort(externalSignal.reason);
        } catch (_error) {
          controller.abort();
        }
      };
      if (externalSignal.aborted) abortListener();
      else externalSignal.addEventListener('abort', abortListener, { once: true });
    }

    const duration = Number.isFinite(Number(timeoutMs)) ? Math.max(1, Number(timeoutMs)) : DEFAULT_TIMEOUT_MS;
    timer = setTimeout(function () {
      try {
        controller.abort(new Error('HyperXosist paid execution timed out.'));
      } catch (_error) {
        controller.abort();
      }
    }, duration);

    return {
      signal: controller.signal,
      cleanup() {
        if (timer) clearTimeout(timer);
        if (externalSignal && abortListener && typeof externalSignal.removeEventListener === 'function') {
          externalSignal.removeEventListener('abort', abortListener);
        }
      }
    };
  }

  async function execute(input, options) {
    const opts = options || {};
    let payment;
    try {
      payment = resolvePayment(opts);
    } catch (error) {
      return failed(null, 'invalid_payment_environment', error && error.message ? error.message : String(error));
    }

    if (!payment) {
      return failed(null, 'payment_configuration_unavailable', 'HyperXosist payment endpoint configuration is unavailable.');
    }
    if (!validInput(input)) {
      return failed(payment, 'invalid_input', 'input must be a JSON object.');
    }

    const signatureResult = normalizeSignature(opts.paymentSignature);
    if (!signatureResult.ok) {
      return failed(payment, signatureResult.code, signatureResult.message);
    }
    const paymentSignature = signatureResult.value;
    if (paymentSignature && opts.confirmPayment !== true) {
      return failed(
        payment,
        'payment_confirmation_required',
        'confirmPayment must be true before a PAYMENT-SIGNATURE is sent. No network request was made.'
      );
    }

    if (opts.signal && opts.signal.aborted) {
      return failed(payment, 'aborted', 'Paid execution was aborted before the network request.');
    }

    const fetchImpl =
      opts.fetch ||
      (root && typeof root.fetch === 'function' ? root.fetch.bind(root) : null);
    if (typeof fetchImpl !== 'function') {
      return failed(payment, 'fetch_unavailable', 'No fetch implementation is available.');
    }

    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    };
    if (paymentSignature) headers[HEADER_NAMES.paymentSignature] = paymentSignature;

    const abortState = createAbortState(opts.signal, opts.timeoutMs);
    let response;
    try {
      response = await fetchImpl(payment.paymentEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(input),
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        signal: abortState.signal
      });
    } catch (error) {
      const aborted =
        (abortState.signal && abortState.signal.aborted) ||
        (error && error.name === 'AbortError');
      return failed(
        payment,
        aborted ? 'aborted' : 'network_error',
        aborted ? 'HyperXosist paid execution was aborted.' : 'Unable to reach the HyperXosist x402 endpoint.'
      );
    } finally {
      abortState.cleanup();
    }

    const body = await readResponseBody(response);
    const paymentRequiredHeader = safeHeader(response.headers, HEADER_NAMES.paymentRequired);
    const paymentResponseHeader = safeHeader(response.headers, HEADER_NAMES.paymentResponse);
    const requestId = safeHeader(response.headers, 'X-Request-Id');
    const common = Object.assign(baseResult(payment), {
      status: Number(response.status) || 0,
      requestId,
      x402: Object.assign({}, baseResult(payment).x402, {
        paymentRequiredHeader,
        paymentRequired: decodeBase64Json(paymentRequiredHeader),
        paymentResponseHeader,
        paymentResponse: decodeBase64Json(paymentResponseHeader)
      })
    });

    if (response.status === 402) {
      return Object.assign(common, {
        ok: false,
        stage: 'payment_required',
        paid: false,
        paymentRequired: true,
        requirements: body,
        nextAction:
          'Authorize x402 payment with a compatible wallet/facilitator, then call hyperxosist_execute again with paymentSignature and confirmPayment=true.',
        retry: {
          tool: 'hyperxosist_execute',
          arguments: {
            input,
            paymentSignature: '<Base64 PAYMENT-SIGNATURE>',
            confirmPayment: true,
            paymentEnvironment: payment.environment
          }
        }
      });
    }

    if (response.ok) {
      return Object.assign(common, {
        ok: true,
        stage: 'completed',
        paid: Boolean(paymentSignature || paymentResponseHeader),
        paymentRequired: false,
        result: body
      });
    }

    return Object.assign(common, {
      ok: false,
      stage: 'failed',
      paid: Boolean(paymentSignature),
      paymentRequired: false,
      error: {
        code: 'upstream_error',
        message: `HyperXosist paid endpoint returned HTTP ${response.status}.`
      },
      upstream: body
    });
  }

  return Object.freeze({
    version: VERSION,
    type: TYPE,
    headers: HEADER_NAMES,
    execute,
    decodeBase64Json,
    normalizeSignature
  });
});
"""

WEBMCP_JS = r"""/** 
 * HyperXosist ChatGPT Site Tools / WebMCP adapter.
 *
 * Free tools stay local/read-only. hyperxosist_execute is the single paid
 * production boundary and delegates payment verification/settlement to the
 * existing x402 Worker through HyperXosistPaidExecution.
 */
(function (root) {
  'use strict';

  const STATE_KEY = '__hyperxosistWebMcpState';
  const documentRef = root && root.document;
  const modelContext = documentRef && documentRef.modelContext;

  if (!modelContext || typeof modelContext.registerTool !== 'function') return;

  const Agent = root.HyperXosistAgent;
  if (!Agent || typeof Agent.dispatchToolCall !== 'function') {
    if (root.console && typeof root.console.warn === 'function') {
      root.console.warn('[HyperXosist WebMCP] HyperXosistAgent dispatcher unavailable; Site Tools skipped.');
    }
    return;
  }

  const PaidExecution = root.HyperXosistPaidExecution;
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
          intent: { type: 'string', description: 'Natural-language research goal.' },
          subject: { type: 'string', description: 'Optional product, project, person, or entity name.' },
          lang: { type: 'string', description: 'Optional language code such as ja or en.' },
          missionId: { type: 'string', description: 'Optional HyperXosist mission identifier.' }
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
          minScore: { type: 'number', description: 'Optional minimum keep score.' }
        },
        required: ['signals'],
        additionalProperties: false
      },
      execute: function (args, context) {
        const input = args || {};
        const mapped = { feedback: input.signals || [] };
        if (input.minScore !== undefined) mapped.minScore = input.minScore;
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
          feedback: { type: 'array', items: { type: 'string' } },
          context: { type: 'string' }
        },
        required: ['productName', 'feedback'],
        additionalProperties: false
      },
      execute: function (args, context) {
        return dispatchLocal('hyperxosist_build_handoff', args || {}, context);
      }
    }
  ];

  if (PaidExecution && typeof PaidExecution.execute === 'function') {
    tools.push({
      name: 'hyperxosist_execute',
      title: 'Execute HyperXosist with x402',
      description:
        'Paid production execution through the existing HyperXosist x402 v2 endpoint (0.01 USDC on Base). First call without paymentSignature returns PAYMENT-REQUIRED details. A retry sends PAYMENT-SIGNATURE only when confirmPayment=true. Never provide a private key or seed phrase.',
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
          input: {
            type: 'object',
            description: 'Structured HyperXosist production query input.',
            additionalProperties: true
          },
          paymentSignature: {
            type: 'string',
            description: 'Optional opaque Base64 x402 v2 PAYMENT-SIGNATURE. This is not a private key.'
          },
          confirmPayment: {
            type: 'boolean',
            description: 'Must be true before paymentSignature is transmitted.'
          },
          paymentEnvironment: {
            type: 'string',
            enum: ['production', 'staging'],
            description: 'Defaults to production.'
          }
        },
        required: ['input'],
        additionalProperties: false
      },
      execute: function (args, context) {
        const input = args || {};
        return PaidExecution.execute(input.input, {
          paymentSignature: input.paymentSignature,
          confirmPayment: input.confirmPayment,
          paymentEnvironment: input.paymentEnvironment || 'production',
          signal: getSignal(context)
        });
      }
    });
  } else if (root.console && typeof root.console.warn === 'function') {
    root.console.warn('[HyperXosist WebMCP] Paid execution bridge unavailable; free Site Tools remain active.');
  }

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
"""

MCP_TOOLS_JS = r"""'use strict';

const PAYMENT_POLICY = Object.freeze({
  planning: 'free',
  filtering: 'free',
  handoff: 'free',
  humanManualSearch: 'free',
  automatedProductionExecution: 'x402_required',
  estimatedCostUsd: 0.01,
});

const COMMERCE_GUIDANCE = Object.freeze({
  canonicalOpenApi: 'https://api.kgninja.dev/openapi.json',
  paidEndpoint: 'https://api.kgninja.dev/hyperxosist-query',
  paymentOptionsEndpoint: 'https://api.kgninja.dev/payment-options.json',
  accessPolicy: 'https://kg-ninja.github.io/HyperXosist-Agent/access-policy.json',
  upgradeRequiredWhen: Object.freeze([
    'Automated production use of a generated X search URL',
    'Automated external collection or paid execution',
  ]),
  upgradeNotRequiredWhen: Object.freeze([
    'MCP discovery, planning, filtering, or handoff',
    'Local preview or dry-run',
    'A human manually opens the official X search URL',
  ]),
});

const SEARCH_PLAN_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    type: { const: 'hyperxosist.search_plan.v1' },
    missionId: { type: 'string' },
    mission: { type: 'object' },
    queries: { type: 'array', items: { type: 'string' } },
    searchUrls: { type: 'array', items: { type: 'string', format: 'uri' } },
    qualityScores: { type: 'array', items: { type: 'number' } },
    estimatedCostUsd: { type: 'number' },
    requiresPaymentForAutomatedProductionUse: { type: 'boolean' },
    paymentPolicy: { type: 'object' },
    accessTier: { const: 'free' },
    canonicalOpenApi: { type: 'string', format: 'uri' },
    paidEndpoint: { type: 'string', format: 'uri' },
    upgradeRequiredWhen: { type: 'array', items: { type: 'string' } },
    upgradeNotRequiredWhen: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'type',
    'missionId',
    'mission',
    'queries',
    'searchUrls',
    'qualityScores',
    'estimatedCostUsd',
    'requiresPaymentForAutomatedProductionUse',
    'paymentPolicy',
    'accessTier',
    'canonicalOpenApi',
    'paidEndpoint',
    'upgradeRequiredWhen',
    'upgradeNotRequiredWhen',
  ],
};

const FILTER_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    type: { const: 'hyperxosist.signal_filter.v1' },
    keep: { type: 'array' },
    discard: { type: 'array' },
    summary: { type: 'object' },
    keepCount: { type: 'integer' },
    discardCount: { type: 'integer' },
    accessTier: { const: 'free' },
    canonicalOpenApi: { type: 'string', format: 'uri' },
  },
  required: ['type', 'keep', 'discard', 'summary', 'keepCount', 'discardCount', 'accessTier', 'canonicalOpenApi'],
};

const HANDOFF_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    type: { const: 'hyperxosist.handoff.v1' },
    handoff: { type: 'object' },
    signalToFixInput: { type: 'object' },
    agentPrompt: { type: 'object' },
    accessTier: { const: 'free' },
    canonicalOpenApi: { type: 'string', format: 'uri' },
  },
  required: ['type', 'handoff', 'signalToFixInput', 'agentPrompt', 'accessTier', 'canonicalOpenApi'],
};

const EXECUTE_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    type: { const: 'hyperxosist.x402_execution.v1' },
    version: { type: 'string' },
    ok: { type: 'boolean' },
    stage: { enum: ['payment_required', 'completed', 'failed'] },
    status: { type: 'integer' },
    paid: { type: 'boolean' },
    paymentRequired: { type: 'boolean' },
    accessTier: { const: 'paid' },
    endpoint: { type: ['string', 'null'] },
    paymentOptionsEndpoint: { type: ['string', 'null'] },
    canonicalOpenApi: { type: ['string', 'null'] },
    x402: { type: 'object' },
    requirements: {},
    result: {},
    error: { type: 'object' },
    retry: { type: 'object' },
  },
  required: [
    'type',
    'version',
    'ok',
    'stage',
    'status',
    'paid',
    'paymentRequired',
    'accessTier',
    'endpoint',
    'paymentOptionsEndpoint',
    'canonicalOpenApi',
    'x402',
  ],
};

const READ_ONLY_ANNOTATIONS = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

const PAID_EXECUTION_ANNOTATIONS = Object.freeze({
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
});

const TOOL_DEFINITIONS = [
  {
    name: 'hyperxosist_search_plan',
    description:
      'Use only for specialized X (Twitter) research planning: complaints, bug reports, feature requests, product feedback, or community signals. Builds multiple noise-reduced official x.com/search URLs and quality scores. It is not general web search and does not scrape X or collect posts. Free.',
    inputSchema: {
      type: 'object',
      properties: {
        intent: {
          type: 'string',
          minLength: 1,
          description:
            'An X-specific research goal, for example: Find user complaints and bug reports on X about Acme.',
        },
      },
      required: ['intent'],
      additionalProperties: false,
    },
    outputSchema: SEARCH_PLAN_OUTPUT_SCHEMA,
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: 'hyperxosist_filter_signals',
    description:
      'Use after X posts or tweet text have already been collected. Separates actionable bugs, feature requests, and UX friction from empty praise, engagement bait, and spam. It does not fetch, scrape, or search X. Free.',
    inputSchema: {
      type: 'object',
      properties: {
        feedback: {
          type: 'array',
          minItems: 1,
          items: { type: 'string', minLength: 1 },
          description: 'Previously collected X post text to classify in memory.',
        },
      },
      required: ['feedback'],
      additionalProperties: false,
    },
    outputSchema: FILTER_OUTPUT_SCHEMA,
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: 'hyperxosist_build_handoff',
    description:
      'Use to turn previously collected X feedback into a structured Signal-to-Fix package and coding-agent prompt. It does not perform general summarization, search the web, scrape X, or modify source code. Free.',
    inputSchema: {
      type: 'object',
      properties: {
        productName: { type: 'string', minLength: 1 },
        feedback: {
          type: 'array',
          minItems: 1,
          items: { type: 'string', minLength: 1 },
          description: 'Previously collected X feedback text.',
        },
      },
      required: ['productName', 'feedback'],
      additionalProperties: false,
    },
    outputSchema: HANDOFF_OUTPUT_SCHEMA,
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: 'hyperxosist_execute',
    description:
      'Paid production execution through the existing x402 v2 endpoint. First call without paymentSignature returns PAYMENT-REQUIRED. Retry with an opaque PAYMENT-SIGNATURE and confirmPayment=true. Price is currently 0.01 USDC on Base; payment-options.json is authoritative. Never send private keys or seed phrases.',
    inputSchema: {
      type: 'object',
      properties: {
        input: {
          type: 'object',
          description: 'Structured HyperXosist production query input.',
          additionalProperties: true,
        },
        paymentSignature: {
          type: 'string',
          minLength: 1,
          description: 'Optional opaque Base64 x402 v2 PAYMENT-SIGNATURE. Not a private key.',
        },
        confirmPayment: {
          type: 'boolean',
          description: 'Must be true before paymentSignature is transmitted.',
        },
        paymentEnvironment: {
          type: 'string',
          enum: ['production', 'staging'],
          description: 'Defaults to the server payment environment.',
        },
      },
      required: ['input'],
      additionalProperties: false,
    },
    outputSchema: EXECUTE_OUTPUT_SCHEMA,
    annotations: PAID_EXECUTION_ANNOTATIONS,
  },
];

module.exports = {
  PAYMENT_POLICY,
  COMMERCE_GUIDANCE,
  TOOL_DEFINITIONS,
  SEARCH_PLAN_OUTPUT_SCHEMA,
  FILTER_OUTPUT_SCHEMA,
  HANDOFF_OUTPUT_SCHEMA,
  EXECUTE_OUTPUT_SCHEMA,
  READ_ONLY_ANNOTATIONS,
  PAID_EXECUTION_ANNOTATIONS,
};
"""

MCP_CORE_JS = r"""'use strict';

const HyperXosistAgent = require('../agent-api.js');
const HyperXosistPaidExecution = require('../paid-execution.js');
const { COMMERCE_GUIDANCE, PAYMENT_POLICY, TOOL_DEFINITIONS } = require('./tools.js');

function errorResult(message) {
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
  };
}

function successResult(structuredContent) {
  return {
    content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
    structuredContent,
  };
}

function validString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validStringArray(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === 'string' && item.trim().length > 0)
  );
}

function validObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function createToolDispatcher(agent = HyperXosistAgent, options = {}) {
  return async function dispatchTool(name, args) {
    try {
      if (name === 'hyperxosist_search_plan') {
        if (!args || !validString(args.intent)) {
          return errorResult("'intent' must be a non-empty string.");
        }

        const session = agent.startAgentSession({
          intent: args.intent.trim(),
          paymentEnvironment: options.paymentEnvironment,
        });
        const plan = session && session.plan;
        if (!plan || !plan.ok || !plan.mission) {
          return errorResult('Unable to build an X research plan.');
        }

        const mission = plan.mission;
        const steps = Array.isArray(mission.steps) ? mission.steps : [];
        const queries = steps.map((step) => String(step.query || ''));
        const searchUrls = steps.map((step) => String(step.searchUrl || ''));
        const qualityScores = steps.map((step) => {
          const value =
            step && step.quality && typeof step.quality.score === 'number'
              ? step.quality.score
              : step && step.score && typeof step.score.score === 'number'
                ? step.score.score
                : typeof step.score === 'number'
                  ? step.score
                  : 0;
          return value;
        });
        const estimatedCostUsd =
          typeof mission.estimatedCostUsd === 'number'
            ? mission.estimatedCostUsd
            : Number((steps.length * PAYMENT_POLICY.estimatedCostUsd).toFixed(2));

        return successResult({
          type: 'hyperxosist.search_plan.v1',
          missionId: String(plan.missionId || mission.id || ''),
          mission,
          queries,
          searchUrls,
          qualityScores,
          estimatedCostUsd,
          accessTier: 'free',
          canonicalOpenApi: COMMERCE_GUIDANCE.canonicalOpenApi,
          paidEndpoint: String(steps[0]?.paidRequest?.endpoint || COMMERCE_GUIDANCE.paidEndpoint),
          upgradeRequiredWhen: COMMERCE_GUIDANCE.upgradeRequiredWhen,
          upgradeNotRequiredWhen: COMMERCE_GUIDANCE.upgradeNotRequiredWhen,
          requiresPaymentForAutomatedProductionUse: true,
          paymentPolicy: PAYMENT_POLICY,
        });
      }

      if (name === 'hyperxosist_filter_signals') {
        if (!args || !validStringArray(args.feedback)) {
          return errorResult("'feedback' must be a non-empty array of non-empty strings.");
        }

        const filtered = agent.filterKeepSignals(args.feedback);
        const keep = Array.isArray(filtered.keep) ? filtered.keep : [];
        const discard = Array.isArray(filtered.discard) ? filtered.discard : [];
        return successResult({
          type: 'hyperxosist.signal_filter.v1',
          keep,
          discard,
          summary: filtered.focusSummary || {},
          keepCount: keep.length,
          discardCount: discard.length,
          accessTier: 'free',
          canonicalOpenApi: COMMERCE_GUIDANCE.canonicalOpenApi,
        });
      }

      if (name === 'hyperxosist_build_handoff') {
        if (!args || !validString(args.productName) || !validStringArray(args.feedback)) {
          return errorResult(
            "'productName' must be a non-empty string and 'feedback' must be a non-empty array of non-empty strings."
          );
        }

        const handoff = agent.buildHandoffPackage({
          productName: args.productName.trim(),
          feedback: args.feedback,
        });
        return successResult({
          type: 'hyperxosist.handoff.v1',
          handoff,
          signalToFixInput: (handoff.signalToFix && handoff.signalToFix.input) || {},
          agentPrompt: handoff.agentPrompt || {},
          accessTier: 'free',
          canonicalOpenApi: COMMERCE_GUIDANCE.canonicalOpenApi,
        });
      }

      if (name === 'hyperxosist_execute') {
        if (!args || !validObject(args.input)) {
          return errorResult("'input' must be a JSON object.");
        }
        const execution = await HyperXosistPaidExecution.execute(args.input, {
          paymentEnvironment:
            args.paymentEnvironment || options.paymentEnvironment || 'production',
          paymentSignature: args.paymentSignature,
          confirmPayment: args.confirmPayment,
          fetch: options.fetch,
          signal: options.signal,
          timeoutMs: options.timeoutMs,
        });
        return successResult(execution);
      }

      return errorResult(`Unknown tool '${String(name)}'.`);
    } catch (_error) {
      return errorResult('Internal tool error.');
    }
  };
}

async function createMcpServer(options = {}) {
  const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
  const { ListToolsRequestSchema, CallToolRequestSchema } = await import(
    '@modelcontextprotocol/sdk/types.js'
  );
  const dispatchTool = createToolDispatcher(options.agent, options);

  const server = new Server(
    { name: 'hyperxosist-mcp-server', version: require('../package.json').version },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const params = request && request.params ? request.params : {};
    return dispatchTool(params.name, params.arguments);
  });

  return server;
}

module.exports = {
  createMcpServer,
  createToolDispatcher,
  errorResult,
  successResult,
};
"""

PAID_EXECUTION_TEST_JS = r"""'use strict';

const assert = require('assert');
const path = require('path');
const PaidExecution = require(path.join(__dirname, '..', 'paid-execution.js'));

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

function encoded(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

function fakeResponse(status, body, headers = {}) {
  const values = new Map(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), String(value)])
  );
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get(name) {
        return values.get(String(name).toLowerCase()) || null;
      }
    },
    async text() {
      return body == null ? '' : typeof body === 'string' ? body : JSON.stringify(body);
    }
  };
}

(async () => {
  await test('unpaid call surfaces x402 v2 PAYMENT-REQUIRED', async () => {
    const requirements = {
      x402Version: 2,
      accepts: [{ scheme: 'exact', network: 'eip155:8453', asset: 'USDC', amount: '10000' }]
    };
    let request;
    const result = await PaidExecution.execute(
      { keywords: 'Acme', mode: 'live' },
      {
        fetch: async (url, init) => {
          request = { url, init };
          return fakeResponse(402, requirements, {
            'PAYMENT-REQUIRED': encoded(requirements),
            'X-Request-Id': 'req-1'
          });
        }
      }
    );
    assert.strictEqual(request.url, 'https://api.kgninja.dev/hyperxosist-query');
    assert.strictEqual(request.init.method, 'POST');
    assert.strictEqual(request.init.headers['PAYMENT-SIGNATURE'], undefined);
    assert.strictEqual(result.stage, 'payment_required');
    assert.strictEqual(result.status, 402);
    assert.strictEqual(result.paymentRequired, true);
    assert.deepStrictEqual(result.x402.paymentRequired, requirements);
    assert.strictEqual(result.retry.arguments.confirmPayment, true);
    assert.ok(!JSON.stringify(result).includes('privateKey'));
  });

  await test('payment signature requires explicit confirmation without network access', async () => {
    let calls = 0;
    const signature = encoded({ payload: 'signed' });
    const result = await PaidExecution.execute(
      { keywords: 'Acme' },
      {
        paymentSignature: signature,
        fetch: async () => {
          calls += 1;
          return fakeResponse(200, {});
        }
      }
    );
    assert.strictEqual(calls, 0);
    assert.strictEqual(result.error.code, 'payment_confirmation_required');
    assert.ok(!JSON.stringify(result).includes(signature));
  });

  await test('confirmed retry forwards PAYMENT-SIGNATURE and returns PAYMENT-RESPONSE', async () => {
    const signature = encoded({ payload: 'signed' });
    const settlement = { success: true, transaction: '0xabc' };
    let request;
    const result = await PaidExecution.execute(
      { keywords: 'Acme' },
      {
        paymentSignature: signature,
        confirmPayment: true,
        fetch: async (url, init) => {
          request = { url, init };
          return fakeResponse(
            200,
            { query: 'Acme -spam', searchUrl: 'https://x.com/search?q=Acme' },
            { 'PAYMENT-RESPONSE': encoded(settlement), 'X-Request-Id': 'req-2' }
          );
        }
      }
    );
    assert.strictEqual(request.init.headers['PAYMENT-SIGNATURE'], signature);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.stage, 'completed');
    assert.strictEqual(result.paid, true);
    assert.deepStrictEqual(result.x402.paymentResponse, settlement);
    assert.ok(!JSON.stringify(result).includes(signature));
  });

  await test('rejects payment header injection', async () => {
    let calls = 0;
    const result = await PaidExecution.execute(
      { keywords: 'Acme' },
      {
        paymentSignature: 'abc\r\nX-Evil: yes',
        confirmPayment: true,
        fetch: async () => {
          calls += 1;
          return fakeResponse(200, {});
        }
      }
    );
    assert.strictEqual(calls, 0);
    assert.strictEqual(result.error.code, 'invalid_payment_signature');
  });

  await test('staging stays on the configured staging endpoint', async () => {
    let url;
    await PaidExecution.execute(
      { keywords: 'Acme' },
      {
        paymentEnvironment: 'staging',
        fetch: async (target) => {
          url = target;
          return fakeResponse(402, {});
        }
      }
    );
    assert.ok(url.includes('mainnet-staging.fuwafuwow.workers.dev/hyperxosist-query'));
  });

  await test('network failure is normalized without leaking details', async () => {
    const result = await PaidExecution.execute(
      { keywords: 'Acme' },
      {
        fetch: async () => {
          throw new Error('SECRET_NETWORK_MARKER');
        }
      }
    );
    assert.strictEqual(result.error.code, 'network_error');
    assert.ok(!JSON.stringify(result).includes('SECRET_NETWORK_MARKER'));
  });

  await test('pre-aborted request does not call the endpoint', async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    const result = await PaidExecution.execute(
      { keywords: 'Acme' },
      {
        signal: controller.signal,
        fetch: async (_url, init) => {
          calls += 1;
          if (init.signal && init.signal.aborted) {
            const error = new Error('aborted');
            error.name = 'AbortError';
            throw error;
          }
          return fakeResponse(200, {});
        }
      }
    );
    assert.strictEqual(result.error.code, 'aborted');
    assert.strictEqual(calls, 0);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
"""

WEBMCP_TEST_JS = r"""/** Zero-dependency tests for the browser-only WebMCP adapter. */
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

function makeHarness(options = {}) {
  const registered = [];
  const calls = [];
  const paidCalls = [];
  const warnings = [];
  const errors = [];
  const dispatch =
    options.dispatch ||
    ((name, args) => {
      calls.push({ name, args });
      return { ok: true, result: { name, args, helper: () => 'not serializable output' } };
    });
  const paidExecute =
    options.paidExecute ||
    (async (input, executionOptions) => {
      paidCalls.push({ input, options: executionOptions });
      return { type: 'hyperxosist.x402_execution.v1', stage: 'payment_required', status: 402 };
    });

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
    HyperXosistPaidExecution: options.missingPaid
      ? undefined
      : { execute: paidExecute },
    AbortController,
    setTimeout,
    clearTimeout
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  return { sandbox, registered, calls, paidCalls, warnings, errors };
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

  await test('registers three free tools and one paid execution tool', async () => {
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

  await test('free tools are read-only and paid execution is consequential', async () => {
    const h = makeHarness();
    load(h);
    h.registered.slice(0, 3).forEach((tool) => {
      assert.strictEqual(tool.annotations.readOnlyHint, true);
      assert.strictEqual(tool.annotations.destructiveHint, false);
    });
    const paid = byName(h, 'hyperxosist_execute');
    assert.strictEqual(paid.annotations.readOnlyHint, false);
    assert.strictEqual(paid.annotations.destructiveHint, true);
    assert.strictEqual(paid.annotations.idempotentHint, false);
    assert.strictEqual(paid.annotations.openWorldHint, true);
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

  await test('paid execution maps input, proof, confirmation, environment and AbortSignal', async () => {
    const h = makeHarness();
    load(h);
    const controller = new AbortController();
    await byName(h, 'hyperxosist_execute').execute(
      {
        input: { keywords: 'Acme' },
        paymentSignature: 'c2lnbmVk',
        confirmPayment: true,
        paymentEnvironment: 'staging'
      },
      { signal: controller.signal }
    );
    assert.deepStrictEqual(h.paidCalls[0].input, { keywords: 'Acme' });
    assert.strictEqual(h.paidCalls[0].options.paymentSignature, 'c2lnbmVk');
    assert.strictEqual(h.paidCalls[0].options.confirmPayment, true);
    assert.strictEqual(h.paidCalls[0].options.paymentEnvironment, 'staging');
    assert.strictEqual(h.paidCalls[0].options.signal, controller.signal);
  });

  await test('does not expose internal payment construction or wallet-secret tools', async () => {
    const h = makeHarness();
    load(h);
    const names = h.registered.map((tool) => tool.name);
    [
      'hyperxosist_build_paid_request',
      'hyperxosist_paid_search',
      'hyperxosist_execute_payment',
      'hyperxosist_sign_payment',
      'hyperxosist_import_private_key'
    ].forEach((forbidden) => assert.ok(!names.includes(forbidden), forbidden));
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

  await test('missing agent skips all registration without throwing', async () => {
    const h = makeHarness({ missingAgent: true });
    assert.doesNotThrow(() => load(h));
    assert.strictEqual(h.registered.length, 0);
    assert.strictEqual(h.warnings.length, 1);
  });

  await test('missing paid executor keeps the three free tools active', async () => {
    const h = makeHarness({ missingPaid: true });
    assert.doesNotThrow(() => load(h));
    assert.deepStrictEqual(
      h.registered.map((tool) => tool.name),
      ['hyperxosist_search_plan', 'hyperxosist_filter_signals', 'hyperxosist_build_handoff']
    );
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
"""

MCP_CORE_TEST_JS = r"""'use strict';

const assert = require('node:assert');
const { createToolDispatcher } = require('../mcp/core.js');
const { TOOL_DEFINITIONS } = require('../mcp/tools.js');

function encoded(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

function fakeResponse(status, body, headers = {}) {
  const values = new Map(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), String(value)])
  );
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get(name) { return values.get(String(name).toLowerCase()) || null; } },
    async text() { return body == null ? '' : JSON.stringify(body); },
  };
}

async function main() {
  assert.strictEqual(TOOL_DEFINITIONS.length, 4);
  const paidDefinition = TOOL_DEFINITIONS.find((tool) => tool.name === 'hyperxosist_execute');
  assert.ok(paidDefinition);
  assert.strictEqual(paidDefinition.annotations.readOnlyHint, false);
  assert.strictEqual(paidDefinition.annotations.destructiveHint, true);

  const dispatch = createToolDispatcher();
  const stagingDispatch = createToolDispatcher(undefined, { paymentEnvironment: 'staging' });

  const plan = await dispatch('hyperxosist_search_plan', {
    intent: 'Find user complaints, bugs, and feature requests on X about HyperXosist-Agent',
  });
  assert.strictEqual(plan.isError, undefined);
  assert.strictEqual(plan.structuredContent.type, 'hyperxosist.search_plan.v1');
  assert.ok(plan.structuredContent.queries.length > 1);
  assert.ok(plan.structuredContent.searchUrls.every((url) => url.startsWith('https://x.com/search')));
  assert.ok(plan.structuredContent.qualityScores.every((score) => typeof score === 'number'));
  assert.ok(plan.structuredContent.mission.steps.every((step) => step.paidRequest.endpoint === 'https://api.kgninja.dev/hyperxosist-query'));
  assert.doesNotMatch(JSON.stringify(plan.structuredContent), /workers\.dev|mainnet-staging/);
  const stagingPlan = await stagingDispatch('hyperxosist_search_plan', { intent: 'Find HyperXosist-Agent bug reports' });
  assert.ok(stagingPlan.structuredContent.mission.steps.every((step) => step.paidRequest.endpoint.includes('mainnet-staging.fuwafuwow.workers.dev')));
  assert.strictEqual(plan.structuredContent.paymentPolicy.planning, 'free');
  assert.strictEqual(plan.structuredContent.paymentPolicy.automatedProductionExecution, 'x402_required');
  assert.strictEqual(plan.structuredContent.accessTier, 'free');
  assert.strictEqual(plan.structuredContent.canonicalOpenApi, 'https://api.kgninja.dev/openapi.json');
  assert.strictEqual(plan.structuredContent.paidEndpoint, 'https://api.kgninja.dev/hyperxosist-query');
  assert.ok(plan.structuredContent.upgradeRequiredWhen.length >= 2);
  assert.ok(plan.structuredContent.upgradeNotRequiredWhen.length >= 2);

  const filtered = await dispatch('hyperxosist_filter_signals', {
    feedback: [
      'HyperXosist crashes when generating a search URL on Safari 18.',
      'Please add a one-click copy button for MCP configuration.',
      'This is amazing, best product ever!',
      'GM giveaway airdrop 100x',
    ],
  });
  assert.strictEqual(filtered.structuredContent.keepCount, 2);
  assert.strictEqual(filtered.structuredContent.discardCount, 2);
  assert.strictEqual(filtered.structuredContent.accessTier, 'free');

  const handoff = await dispatch('hyperxosist_build_handoff', {
    productName: 'HyperXosist-Agent',
    feedback: [
      'HyperXosist crashes when generating a search URL on Safari 18.',
      'Please add a one-click copy button for MCP configuration.',
    ],
  });
  assert.strictEqual(handoff.structuredContent.type, 'hyperxosist.handoff.v1');
  assert.strictEqual(handoff.structuredContent.handoff.feedbackCount, 2);
  assert.strictEqual(handoff.structuredContent.signalToFixInput.productName, 'HyperXosist-Agent');
  assert.ok(handoff.structuredContent.agentPrompt.markdown);

  let unpaidRequest;
  const requirement = { x402Version: 2, accepts: [{ network: 'eip155:8453' }] };
  const unpaidDispatch = createToolDispatcher(undefined, {
    fetch: async (url, init) => {
      unpaidRequest = { url, init };
      return fakeResponse(402, requirement, { 'PAYMENT-REQUIRED': encoded(requirement) });
    },
  });
  const unpaid = await unpaidDispatch('hyperxosist_execute', {
    input: { keywords: 'HyperXosist-Agent', mode: 'live' },
  });
  assert.strictEqual(unpaid.structuredContent.type, 'hyperxosist.x402_execution.v1');
  assert.strictEqual(unpaid.structuredContent.stage, 'payment_required');
  assert.strictEqual(unpaid.structuredContent.paymentRequired, true);
  assert.strictEqual(unpaidRequest.init.headers['PAYMENT-SIGNATURE'], undefined);

  const signature = encoded({ payload: 'signed' });
  let paidRequest;
  const paidDispatch = createToolDispatcher(undefined, {
    fetch: async (url, init) => {
      paidRequest = { url, init };
      return fakeResponse(200, { query: 'HyperXosist-Agent -spam' }, {
        'PAYMENT-RESPONSE': encoded({ success: true, transaction: '0xabc' }),
      });
    },
  });
  const paid = await paidDispatch('hyperxosist_execute', {
    input: { keywords: 'HyperXosist-Agent' },
    paymentSignature: signature,
    confirmPayment: true,
  });
  assert.strictEqual(paid.structuredContent.stage, 'completed');
  assert.strictEqual(paid.structuredContent.paid, true);
  assert.strictEqual(paidRequest.init.headers['PAYMENT-SIGNATURE'], signature);

  let blockedCalls = 0;
  const blocked = await createToolDispatcher(undefined, {
    fetch: async () => {
      blockedCalls += 1;
      return fakeResponse(200, {});
    },
  })('hyperxosist_execute', {
    input: { keywords: 'HyperXosist-Agent' },
    paymentSignature: signature,
  });
  assert.strictEqual(blocked.structuredContent.error.code, 'payment_confirmation_required');
  assert.strictEqual(blockedCalls, 0);

  assert.strictEqual((await dispatch('hyperxosist_search_plan', { intent: ' ' })).isError, true);
  assert.strictEqual((await dispatch('hyperxosist_filter_signals', { feedback: ['ok', 42] })).isError, true);
  assert.strictEqual((await dispatch('hyperxosist_execute', { input: [] })).isError, true);
  assert.strictEqual((await dispatch('unknown_tool', {})).isError, true);

  const failingDispatch = createToolDispatcher({
    startAgentSession() {
      throw new Error('SECRET_STACK_MARKER');
    },
  });
  const failure = await failingDispatch('hyperxosist_search_plan', { intent: 'X bugs' });
  assert.strictEqual(failure.isError, true);
  assert.doesNotMatch(failure.content[0].text, /SECRET_STACK_MARKER|at createToolDispatcher/);

  console.log('MCP core tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
"""

MCP_SCHEMA_TEST_JS = r"""'use strict';

const assert = require('node:assert');
const { TOOL_DEFINITIONS } = require('../mcp/tools.js');
const { createToolDispatcher } = require('../mcp/core.js');

async function main() {
  assert.strictEqual(TOOL_DEFINITIONS.length, 4);
  for (const tool of TOOL_DEFINITIONS) {
    assert.strictEqual(tool.inputSchema.type, 'object');
    assert.strictEqual(tool.inputSchema.additionalProperties, false);
    assert.strictEqual(tool.outputSchema.type, 'object');
    assert.ok(Array.isArray(tool.outputSchema.required));
    assert.strictEqual(typeof tool.annotations.readOnlyHint, 'boolean');
    assert.strictEqual(typeof tool.annotations.destructiveHint, 'boolean');
  }

  const free = TOOL_DEFINITIONS.filter((tool) => tool.name !== 'hyperxosist_execute');
  assert.ok(free.every((tool) => tool.annotations.readOnlyHint === true));
  const paid = TOOL_DEFINITIONS.find((tool) => tool.name === 'hyperxosist_execute');
  assert.strictEqual(paid.annotations.readOnlyHint, false);
  assert.strictEqual(paid.annotations.destructiveHint, true);
  assert.strictEqual(paid.inputSchema.properties.confirmPayment.type, 'boolean');
  assert.strictEqual(paid.outputSchema.properties.type.const, 'hyperxosist.x402_execution.v1');

  const dispatch = createToolDispatcher();
  const cases = [
    [
      'hyperxosist_search_plan',
      { intent: 'Find complaints on X about Acme' },
      'hyperxosist.search_plan.v1',
    ],
    [
      'hyperxosist_filter_signals',
      { feedback: ['Acme crashes on Safari 18.'] },
      'hyperxosist.signal_filter.v1',
    ],
    [
      'hyperxosist_build_handoff',
      { productName: 'Acme', feedback: ['Acme crashes on Safari 18.'] },
      'hyperxosist.handoff.v1',
    ],
  ];

  for (const [name, args, expectedType] of cases) {
    const result = await dispatch(name, args);
    assert.strictEqual(result.structuredContent.type, expectedType);
    assert.deepStrictEqual(JSON.parse(result.content[0].text), JSON.parse(JSON.stringify(result.structuredContent)));
  }

  console.log('MCP schema tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
"""


def build_access_policy() -> dict:
    return {
        "schemaVersion": "1.0",
        "name": "HyperXosist Access Policy",
        "version": VERSION_NEW,
        "policy": "free-discovery-and-analysis-paid-production-execution",
        "requiresPaymentForAgentUse": False,
        "requiresPaymentForProductionExecution": True,
        "sourceOfTruth": {
            "payment": "https://api.kgninja.dev/payment-options.json",
            "openapi": "https://api.kgninja.dev/openapi.json",
            "repository": "https://github.com/KG-NINJA/HyperXosist-Agent",
        },
        "surfaces": {
            "humanUi": {
                "authentication": "none",
                "paymentRequired": False,
                "capabilities": ["manual X search launch", "local preview", "manual signal collection"],
            },
            "webMcp": {
                "transport": "document.modelContext",
                "authentication": "none",
                "freeTools": [
                    "hyperxosist_search_plan",
                    "hyperxosist_filter_signals",
                    "hyperxosist_build_handoff",
                ],
                "paidTools": ["hyperxosist_execute"],
                "paidExecution": {
                    "protocol": "x402",
                    "endpoint": "https://api.kgninja.dev/hyperxosist-query",
                    "price": {"amount": "0.01", "asset": "USDC", "network": "eip155:8453"},
                    "firstCall": "Returns HTTP 402 requirements through the Site Tool result.",
                    "retry": "Supply PAYMENT-SIGNATURE and set confirmPayment=true.",
                },
            },
            "remoteMcp": {
                "endpoint": "https://mcp.kgninja.dev/mcp",
                "authentication": "none for public free mode; bearer only for private/self-hosted mode",
                "freeTools": [
                    "hyperxosist_search_plan",
                    "hyperxosist_filter_signals",
                    "hyperxosist_build_handoff",
                ],
                "paidTools": ["hyperxosist_execute"],
                "paymentVerifier": "https://api.kgninja.dev/hyperxosist-query",
            },
        },
        "x402": {
            "version": 2,
            "scheme": "exact",
            "paymentRequiredHeader": "PAYMENT-REQUIRED",
            "paymentSignatureHeader": "PAYMENT-SIGNATURE",
            "paymentResponseHeader": "PAYMENT-RESPONSE",
            "expectedUnpaidStatus": 402,
            "expectedPaidStatus": 200,
            "paymentOptions": "https://api.kgninja.dev/payment-options.json",
        },
        "safety": {
            "explicitConfirmationRequired": True,
            "confirmationField": "confirmPayment",
            "neverAccepted": ["private keys", "seed phrases", "wallet passwords"],
            "endpointAllowlist": [
                "https://api.kgninja.dev/hyperxosist-query",
                "https://kg-ninja-x402-revenue-gate-mainnet-staging.fuwafuwow.workers.dev/hyperxosist-query",
            ],
            "notes": [
                "The static site does not verify or settle payments.",
                "The existing x402 Worker remains the only payment verifier and settlement boundary.",
                "A PAYMENT-SIGNATURE is opaque authorization data and must not be logged or echoed.",
            ],
        },
    }


def mutate_json_manifests() -> None:
    data, nl = load_json_preserved("package.json")
    data["version"] = VERSION_NEW
    files = data.setdefault("files", [])
    for name in ["paid-execution.js", "access-policy.json"]:
        if name not in files:
            insert_at = files.index("payment-endpoints.js") + 1 if "payment-endpoints.js" in files else len(files)
            files.insert(insert_at, name)
    scripts = data.setdefault("scripts", {})
    scripts["test"] = scripts["test"].replace(
        "node test/payment-endpoints.test.js && node test/webmcp.test.js",
        "node test/payment-endpoints.test.js && node test/paid-execution.test.js && node test/webmcp.test.js",
    )
    scripts["test:paid-execution"] = "node test/paid-execution.test.js"
    dump_json_preserved("package.json", data, nl)

    data, nl = load_json_preserved("package-lock.json")
    data["version"] = VERSION_NEW
    data["packages"][""]["version"] = VERSION_NEW
    dump_json_preserved("package-lock.json", data, nl)

    data, nl = load_json_preserved("agent-use.json")
    data["version"] = VERSION_NEW
    data["requiresPaymentForAgentUse"] = False
    data["requiresPaymentForProductionExecution"] = True
    data["requiresAuthenticationForPublicRemoteMcp"] = False
    data["accessPolicyManifest"] = "access-policy.json"
    remote = data.setdefault("remoteMcp", {})
    remote["authentication"] = "none"
    remote["accessMode"] = "public-free"
    remote["authenticationRequired"] = False
    remote["publicFreeAccess"] = True
    remote["privateOrSelfHostedAuthentication"] = "bearer"
    remote["paymentRequiredForFreeOperations"] = False
    remote["paidTools"] = ["hyperxosist_execute"]
    remote["accessPolicy"] = "https://kg-ninja.github.io/HyperXosist-Agent/access-policy.json"
    quick = data.setdefault("quickstartForAgents", {})
    quick["paidSiteTool"] = (
        "Call hyperxosist_execute({ input }) to receive PAYMENT-REQUIRED; retry with "
        "paymentSignature and confirmPayment=true."
    )
    entry = data.setdefault("entrypoints", {})
    entry["paidExecutionScript"] = "paid-execution.js"
    entry["siteToolsAdapter"] = "webmcp.js"
    entry["accessPolicy"] = "access-policy.json"
    policy = data.setdefault("agentUsePolicy", {})
    policy.update(
        {
            "humanBrowserUse": "free",
            "aiAgentUse": "free for discovery, planning, filtering, and handoff; x402 for production execution",
            "mustNotBypassPayment": True,
            "mustNotBypassPaymentScope": "automated-production-execution-only",
            "paymentVerifier": "https://api.kgninja.dev/hyperxosist-query",
            "localPlanningAllowed": True,
            "publicRemoteMcpAuthentication": "none",
            "requiresPaymentForAgentUse": False,
            "requiresPaymentForProductionExecution": True,
        }
    )
    data.setdefault("apiSurface", {})["version"] = VERSION_NEW
    data["siteTools"] = {
        "transport": "WebMCP document.modelContext",
        "authentication": "none",
        "freeTools": [
            "hyperxosist_search_plan",
            "hyperxosist_filter_signals",
            "hyperxosist_build_handoff",
        ],
        "paidTools": ["hyperxosist_execute"],
        "paidExecution": {
            "protocol": "x402-v2",
            "paymentRequiredHeader": "PAYMENT-REQUIRED",
            "paymentSignatureHeader": "PAYMENT-SIGNATURE",
            "paymentResponseHeader": "PAYMENT-RESPONSE",
            "confirmPaymentRequired": True,
            "privateKeysAccepted": False,
        },
    }
    data.setdefault("failureRecovery", {})[
        "paymentSignatureMissing"
    ] = "Call hyperxosist_execute without a signature, authorize from PAYMENT-REQUIRED, then retry with confirmPayment=true."
    dump_json_preserved("agent-use.json", data, nl)

    data, nl = load_json_preserved("agent-tools.json")
    data["version"] = VERSION_NEW
    data["requiresPaymentForAgentUse"] = False
    data["requiresPaymentForProductionExecution"] = True
    data["accessPolicyManifest"] = "access-policy.json"
    remote = data.setdefault("remoteMcp", {})
    remote["authentication"] = "none"
    remote["accessMode"] = "public-free"
    remote["authenticationRequired"] = False
    remote["publicFreeAccess"] = True
    remote["privateOrSelfHostedAuthentication"] = "bearer"
    remote["paymentRequiredForFreeOperations"] = False
    remote["paidTools"] = ["hyperxosist_execute"]
    data["siteTools"] = {
        "transport": "WebMCP document.modelContext",
        "authentication": "none",
        "freeTools": [
            "hyperxosist_search_plan",
            "hyperxosist_filter_signals",
            "hyperxosist_build_handoff",
        ],
        "paidTools": ["hyperxosist_execute"],
        "handler": "HyperXosistPaidExecution.execute",
        "paymentProtocol": "x402-v2",
        "confirmPaymentRequired": True,
    }
    data["paidToolDefinitions"] = [
        {
            "name": "hyperxosist_execute",
            "handler": "HyperXosistPaidExecution.execute(input, options)",
            "availableVia": ["WebMCP Site Tools", "Remote MCP"],
            "inputSchema": {
                "type": "object",
                "properties": {
                    "input": {"type": "object", "additionalProperties": True},
                    "paymentSignature": {
                        "type": "string",
                        "description": "Opaque Base64 x402 v2 PAYMENT-SIGNATURE; never a private key.",
                    },
                    "confirmPayment": {"type": "boolean"},
                    "paymentEnvironment": {
                        "type": "string",
                        "enum": ["production", "staging"],
                    },
                },
                "required": ["input"],
                "additionalProperties": False,
            },
            "payment": {
                "required": True,
                "protocol": "x402",
                "x402Version": 2,
                "endpoint": "https://api.kgninja.dev/hyperxosist-query",
                "paymentOptions": "https://api.kgninja.dev/payment-options.json",
                "paymentRequiredHeader": "PAYMENT-REQUIRED",
                "paymentSignatureHeader": "PAYMENT-SIGNATURE",
                "paymentResponseHeader": "PAYMENT-RESPONSE",
                "confirmPaymentRequired": True,
            },
        }
    ]
    dump_json_preserved("agent-tools.json", data, nl)

    data, nl = load_json_preserved("x402-payment.json")
    data["status"] = "payment-required-for-production-execution"
    data["requiresPaymentForAgentUse"] = False
    data["requiresPaymentForProductionExecution"] = True
    data["paidTools"] = ["hyperxosist_execute"]
    data["headers"] = {
        "paymentRequired": "PAYMENT-REQUIRED",
        "paymentSignature": "PAYMENT-SIGNATURE",
        "paymentResponse": "PAYMENT-RESPONSE",
    }
    data["explicitConfirmationField"] = "confirmPayment"
    data["lastSynced"] = TODAY
    data["instructionsForAgents"] = [
        "Use free planning, filtering, and handoff tools without payment.",
        "Call hyperxosist_execute without paymentSignature to receive PAYMENT-REQUIRED.",
        "Authorize payment with a compatible x402 wallet or facilitator.",
        "Retry hyperxosist_execute with the Base64 PAYMENT-SIGNATURE and confirmPayment=true.",
        "Never provide private keys, seed phrases, wallet passwords, or arbitrary Authorization headers.",
        "The existing x402 Worker remains the payment verifier and settlement boundary.",
    ]
    dump_json_preserved("x402-payment.json", data, nl)

    data, nl = load_json_preserved(".well-known/mcp.json")
    data["version"] = VERSION_NEW
    data["lastSynced"] = TODAY
    data["authentication"] = "none"
    data["accessMode"] = "public-free"
    data["authenticationRequired"] = False
    data["publicFreeAccess"] = True
    data["privateOrSelfHostedAuthentication"] = "bearer"
    data["paidTools"] = ["hyperxosist_execute"]
    paid = data.setdefault("paidExecution", {})
    paid.update(
        {
            "tool": "hyperxosist_execute",
            "protocol": "x402",
            "x402Version": 2,
            "endpoint": "https://api.kgninja.dev/hyperxosist-query",
            "price": "0.01 USDC",
            "network": "eip155:8453",
            "paymentRequiredHeader": "PAYMENT-REQUIRED",
            "paymentSignatureHeader": "PAYMENT-SIGNATURE",
            "paymentResponseHeader": "PAYMENT-RESPONSE",
            "confirmPaymentRequired": True,
        }
    )
    data["accessPolicy"] = "https://kg-ninja.github.io/HyperXosist-Agent/access-policy.json"
    dump_json_preserved(".well-known/mcp.json", data, nl)

    data, nl = load_json_preserved("mcp-catalog.json")
    server = data.setdefault("server", {})
    server["authentication"] = "none"
    server["accessMode"] = "public-free"
    server["authenticationRequired"] = False
    server["publicFreeAccess"] = True
    server["privateOrSelfHostedAuthentication"] = "bearer"
    data["tools"] = [
        "hyperxosist_search_plan",
        "hyperxosist_filter_signals",
        "hyperxosist_build_handoff",
        "hyperxosist_execute",
    ]
    data["freeTools"] = [
        "hyperxosist_search_plan",
        "hyperxosist_filter_signals",
        "hyperxosist_build_handoff",
    ]
    data["paidTools"] = ["hyperxosist_execute"]
    data["paidExecution"].update(
        {
            "tool": "hyperxosist_execute",
            "x402Version": 2,
            "paymentRequiredHeader": "PAYMENT-REQUIRED",
            "paymentSignatureHeader": "PAYMENT-SIGNATURE",
            "paymentResponseHeader": "PAYMENT-RESPONSE",
            "confirmPaymentRequired": True,
        }
    )
    data["lastSynced"] = TODAY
    data["lastVerified"] = TODAY
    data["accessPolicy"] = "https://kg-ninja.github.io/HyperXosist-Agent/access-policy.json"
    dump_json_preserved("mcp-catalog.json", data, nl, compact=True)

    dump_json_preserved("access-policy.json", build_access_policy(), "\n")


def mutate_agent_api() -> None:
    text, nl = read_preserved("agent-api.js")
    text = replace_once(text, "HyperXosist Agent API v2.4.0", "HyperXosist Agent API v2.6.0", "agent-api banner")
    text = replace_once(text, "const VERSION = '2.5.0';", "const VERSION = '2.6.0';", "agent-api version")
    text = replace_once(
        text,
        "    paymentRequired: true,\n    agentUseRequiresPayment: true,\n",
        "    paymentRequired: true,\n"
        "    paymentRequiredScope: 'automated-production-execution-only',\n"
        "    agentUseRequiresPayment: false,\n"
        "    productionExecutionRequiresPayment: true,\n"
        "    accessPolicyManifest: 'access-policy.json',\n",
        "agent-api payment boundary",
    )
    write_preserved("agent-api.js", text, nl)


def mutate_worker() -> None:
    text, nl = read_preserved("workers/remote-mcp/src/index.js")
    text = replace_once(
        text,
        "    const requestId = createRequestId();\n    const startedAt = Date.now();\n",
        "    const requestId = createRequestId();\n"
        "    const startedAt = Date.now();\n"
        "    const publicFreeAccess = String(env.HYPERXOSIST_MCP_PUBLIC_FREE_ACCESS || '').toLowerCase() === 'true';\n",
        "worker public mode",
    )
    text = replace_once(text, "        version: '2.5.0',", "        version: '2.6.0',", "worker version")
    text = replace_once(
        text,
        "        authentication: 'public-free',",
        "        authentication: publicFreeAccess ? 'none' : 'bearer',\n"
        "        accessMode: publicFreeAccess ? 'public-free' : 'private-authenticated',\n"
        "        authenticationRequired: !publicFreeAccess,\n"
        "        publicFreeAccess,\n"
        "        privateOrSelfHostedAuthentication: 'bearer',",
        "worker auth metadata",
    )
    text = replace_once(
        text,
        "        freeTools: [\n"
        "          'hyperxosist_search_plan',\n"
        "          'hyperxosist_filter_signals',\n"
        "          'hyperxosist_build_handoff',\n"
        "        ],",
        "        freeTools: [\n"
        "          'hyperxosist_search_plan',\n"
        "          'hyperxosist_filter_signals',\n"
        "          'hyperxosist_build_handoff',\n"
        "        ],\n"
        "        paidTools: ['hyperxosist_execute'],",
        "worker paid tools",
    )
    text = replace_once(
        text,
        "          protocol: 'x402',\n"
        "          endpoint: 'https://api.kgninja.dev/hyperxosist-query',\n"
        "          price: '0.01 USDC',\n"
        "          network: 'eip155:8453',\n"
        "        },",
        "          tool: 'hyperxosist_execute',\n"
        "          protocol: 'x402',\n"
        "          x402Version: 2,\n"
        "          endpoint: 'https://api.kgninja.dev/hyperxosist-query',\n"
        "          price: '0.01 USDC',\n"
        "          network: 'eip155:8453',\n"
        "          paymentRequiredHeader: 'PAYMENT-REQUIRED',\n"
        "          paymentSignatureHeader: 'PAYMENT-SIGNATURE',\n"
        "          paymentResponseHeader: 'PAYMENT-RESPONSE',\n"
        "          confirmPaymentRequired: true,\n"
        "        },",
        "worker paid metadata",
    )
    text = replace_once(
        text,
        '        publicFreeAccess: String(env.HYPERXOSIST_MCP_PUBLIC_FREE_ACCESS || "").toLowerCase() === "true",',
        "        publicFreeAccess,\n"
        "        freeToolCount: 3,\n"
        "        paidTools: ['hyperxosist_execute'],",
        "worker health metadata",
    )
    text = replace_once(
        text,
        '    const publicFreeAccess = String(env.HYPERXOSIST_MCP_PUBLIC_FREE_ACCESS || "").toLowerCase() === "true";\n',
        "",
        "worker duplicate public mode",
    )
    write_preserved("workers/remote-mcp/src/index.js", text, nl)


def mutate_tests() -> None:
    text, nl = read_preserved("test/mcp.test.js")
    text = replace_once(text, "assert.strictEqual(tools.length, 3);", "assert.strictEqual(tools.length, 4);", "mcp integration tool count")
    text = replace_once(
        text,
        "          'hyperxosist_build_handoff',\n"
        "          'hyperxosist_filter_signals',\n"
        "          'hyperxosist_search_plan'\n",
        "          'hyperxosist_build_handoff',\n"
        "          'hyperxosist_execute',\n"
        "          'hyperxosist_filter_signals',\n"
        "          'hyperxosist_search_plan'\n",
        "mcp integration tool names",
    )
    write_preserved("test/mcp.test.js", text, nl)

    text, nl = read_preserved("test/mcp-remote.test.js")
    text = replace_once(
        text,
        "        'hyperxosist_build_handoff',\n"
        "        'hyperxosist_filter_signals',\n"
        "        'hyperxosist_search_plan',\n",
        "        'hyperxosist_build_handoff',\n"
        "        'hyperxosist_execute',\n"
        "        'hyperxosist_filter_signals',\n"
        "        'hyperxosist_search_plan',\n",
        "remote mcp tool names",
    )
    write_preserved("test/mcp-remote.test.js", text, nl)

    text, nl = read_preserved("test/mcp-cloudflare-worker.test.mjs")
    marker = "test('Cloudflare Worker handles a stateless MCP initialize request', async () => {"
    discovery_test = r"""test('Cloudflare Worker advertises free tools and the x402 paid execution tool', async () => {
  const response = await worker.fetch(
    request('/.well-known/mcp.json', { method: 'GET' }),
    { ...env, HYPERXOSIST_MCP_PUBLIC_FREE_ACCESS: 'true' }
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.authentication, 'none');
  assert.equal(body.authenticationRequired, false);
  assert.equal(body.publicFreeAccess, true);
  assert.deepEqual(body.freeTools, [
    'hyperxosist_search_plan',
    'hyperxosist_filter_signals',
    'hyperxosist_build_handoff',
  ]);
  assert.deepEqual(body.paidTools, ['hyperxosist_execute']);
  assert.equal(body.paidExecution.tool, 'hyperxosist_execute');
  assert.equal(body.paidExecution.paymentSignatureHeader, 'PAYMENT-SIGNATURE');
});

"""
    text = replace_once(text, marker, discovery_test + marker, "cloudflare discovery test")
    write_preserved("test/mcp-cloudflare-worker.test.mjs", text, nl)


def mutate_html() -> None:
    text, nl = read_preserved("index.html")
    text = replace_once(
        text,
        "    Site Tools として直接利用できます。初期3ツールはローカル・read-only・無料です。",
        "    Site Tools として直接利用できます。planning / filtering / handoff の3ツールはローカル・read-only・無料です。",
        "site tools free copy",
    )
    text = replace_once(
        text,
        "    Site Tools は X をスクレイピングせず、本番検索を自動実行せず、x402 決済も行いません。\n"
        "    WebMCP は提案中の Web API のため、<code>document.modelContext</code> 対応環境でのみ有効です。",
        "    第4ツール <code>hyperxosist_execute</code> だけが有料のproduction executionです。最初の呼び出しで\n"
        "    <code>PAYMENT-REQUIRED</code> を受け取り、対応ウォレットで承認後、<code>PAYMENT-SIGNATURE</code> と\n"
        "    <code>confirmPayment=true</code> を渡して再実行します。秘密鍵やシードフレーズは入力しません。\n"
        "    WebMCP は提案中の Web API のため、<code>document.modelContext</code> 対応環境でのみ有効です。",
        "site tools paid copy",
    )
    text = replace_once(text, "<dt>Authentication</dt><dd>Bearer token</dd>", "<dt>Free MCP authentication</dt><dd>Public / none</dd>\n            <dt>Private/self-hosted mode</dt><dd>Optional Bearer token</dd>", "remote auth copy")
    text = replace_once(
        text,
        "<p><strong>有料:</strong> production search URL usage、automated external collection、<a href=\"https://api.kgninja.dev/hyperxosist-query\">paid execution endpoint</a>。</p>",
        "<p><strong>有料:</strong> <code>hyperxosist_execute</code>（x402 v2 / 0.01 USDC / Base）。production search URL usage、automated external collection、<a href=\"https://api.kgninja.dev/hyperxosist-query\">paid execution endpoint</a>。</p>\n"
        "          <p>機械可読な境界: <a href=\"access-policy.json\"><code>access-policy.json</code></a></p>",
        "remote paid copy",
    )
    text = text.replace('id="footerVersion">2.5.0', 'id="footerVersion">2.6.0')
    text = replace_once(
        text,
        '  <script src="agent-api.js"></script>\n  <script src="webmcp.js"></script>',
        '  <script src="agent-api.js"></script>\n  <script src="paid-execution.js"></script>\n  <script src="webmcp.js"></script>',
        "paid script order",
    )
    write_preserved("index.html", text, nl)


def mutate_docs() -> None:
    text, nl = read_preserved("README.md")
    text = text.replace("v2.5.0", "v2.6.0")
    webmcp_marker = "## ChatGPT Site Tools / WebMCP"
    if webmcp_marker in text and "hyperxosist_execute" not in text[text.index(webmcp_marker):text.index(webmcp_marker)+1800]:
        insertion = """
### Free-to-paid Site Tool boundary

The three discovery/analysis tools remain free and read-only:

- `hyperxosist_search_plan`
- `hyperxosist_filter_signals`
- `hyperxosist_build_handoff`

`hyperxosist_execute` is the only paid Site Tool. It calls the existing x402 v2 production endpoint. An unsigned call returns `PAYMENT-REQUIRED`; a compatible client authorizes payment and retries with `PAYMENT-SIGNATURE` plus `confirmPayment: true`. The site never requests or stores private keys, seed phrases, or wallet passwords. See [`access-policy.json`](access-policy.json).

"""
        pos = text.find("\n## ", text.index(webmcp_marker) + len(webmcp_marker))
        if pos == -1:
            text += "\n" + insertion
        else:
            text = text[:pos] + "\n" + insertion + text[pos:]
    else:
        text += """

## WebMCP and x402 execution

The three Site Tools for planning, filtering, and handoff are free and read-only. `hyperxosist_execute` is the only paid Site Tool and uses the existing x402 v2 endpoint. Call once without a signature to receive `PAYMENT-REQUIRED`, then retry with an opaque `PAYMENT-SIGNATURE` and `confirmPayment: true`. Never provide private keys or seed phrases. See [`access-policy.json`](access-policy.json).
"""
    write_preserved("README.md", text, nl)

    text, nl = read_preserved("AGENTS.md")
    text = text.replace("v2.5.0", "v2.6.0")
    if "## WebMCP paid execution boundary" not in text:
        text += """

## WebMCP paid execution boundary

- Free/read-only: `hyperxosist_search_plan`, `hyperxosist_filter_signals`, `hyperxosist_build_handoff`.
- Paid/open-world: `hyperxosist_execute`.
- First call without `paymentSignature` must return the x402 v2 `PAYMENT-REQUIRED` requirements.
- Retry only after authorization, with `paymentSignature` and `confirmPayment: true`.
- Never request, accept, log, or store private keys, seed phrases, or wallet passwords.
- Payment verification and settlement stay at `https://api.kgninja.dev/hyperxosist-query`.
- Canonical access boundary: `access-policy.json`.
"""
    write_preserved("AGENTS.md", text, nl)

    text, nl = read_preserved("llms.txt")
    if "access-policy.json" not in text:
        text += "\n- Access policy: https://kg-ninja.github.io/HyperXosist-Agent/access-policy.json\n"
    if "hyperxosist_execute" not in text:
        text += (
            "- WebMCP/MCP paid tool: hyperxosist_execute — x402 v2 production execution only; "
            "first call returns PAYMENT-REQUIRED, retry requires PAYMENT-SIGNATURE and confirmPayment=true.\n"
        )
    write_preserved("llms.txt", text, nl)

    text, nl = read_preserved("CHANGELOG.md")
    if "## [2.6.0]" not in text:
        entry = """## [2.6.0] - 2026-09-03

### Added
- `hyperxosist_execute` as the single x402-paid production tool for WebMCP and Remote MCP.
- `paid-execution.js`, a shared 402 → PAYMENT-SIGNATURE → 200 bridge with explicit payment confirmation.
- `access-policy.json` and machine-readable free/paid tool metadata.
- Paid execution and WebMCP boundary tests.

### Changed
- Public Remote MCP authentication metadata now reports `none`; Bearer remains optional for private/self-hosted mode.
- Agent use is free for discovery, planning, filtering, and handoff. Payment is required only for production execution.
- Version bumped to 2.6.0.

"""
        heading_end = text.find("\n", text.find("# "))
        if heading_end == -1:
            text = entry + text
        else:
            text = text[: heading_end + 1] + "\n" + entry + text[heading_end + 1 :]
    write_preserved("CHANGELOG.md", text, nl)

    for rel in ["docs/MCP.md", "docs/CHATGPT_APP.md"]:
        text, nl = read_preserved(rel)
        if "hyperxosist_execute" not in text:
            text += """

## Paid execution

Discovery, planning, filtering, and handoff remain free. `hyperxosist_execute` is the only paid production tool. It delegates verification and settlement to the existing x402 v2 endpoint. An unsigned call returns `PAYMENT-REQUIRED`; a confirmed retry supplies `PAYMENT-SIGNATURE`. Clients must never provide private keys or seed phrases.
"""
        write_preserved(rel, text, nl)


def main() -> None:
    write_preserved("paid-execution.js", PAID_EXECUTION_JS, "\n")
    write_preserved("webmcp.js", WEBMCP_JS, "\n")
    write_preserved("mcp/tools.js", MCP_TOOLS_JS, "\n")
    write_preserved("mcp/core.js", MCP_CORE_JS, "\n")
    write_preserved("test/paid-execution.test.js", PAID_EXECUTION_TEST_JS, "\n")
    write_preserved("test/webmcp.test.js", WEBMCP_TEST_JS, "\n")
    write_preserved("test/mcp-core.test.js", MCP_CORE_TEST_JS, "\n")
    write_preserved("test/mcp-schema.test.js", MCP_SCHEMA_TEST_JS, "\n")

    mutate_json_manifests()
    mutate_agent_api()
    mutate_worker()
    mutate_tests()
    mutate_html()
    mutate_docs()

    # Parse every changed JSON manifest after mutation.
    for rel in [
        "package.json",
        "package-lock.json",
        "agent-use.json",
        "agent-tools.json",
        "x402-payment.json",
        ".well-known/mcp.json",
        "mcp-catalog.json",
        "access-policy.json",
    ]:
        json.loads(path(rel).read_text(encoding="utf-8-sig"))

    print("Applied WebMCP/MCP x402 paid execution boundary.")


if __name__ == "__main__":
    main()
