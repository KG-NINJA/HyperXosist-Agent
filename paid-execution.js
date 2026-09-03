'use strict';

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
