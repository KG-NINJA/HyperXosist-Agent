'use strict';

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
