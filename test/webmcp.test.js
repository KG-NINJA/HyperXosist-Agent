/**
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

function makeHarness(options = {}) {
  const registered = [];
  const calls = [];
  const warnings = [];
  const errors = [];
  const dispatch =
    options.dispatch ||
    ((name, args) => {
      calls.push({ name, args });
      return { ok: true, result: { name, args, helper: () => 'not serializable output' } };
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
    AbortController,
    setTimeout,
    clearTimeout
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  return { sandbox, registered, calls, warnings, errors };
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

  await test('registers exactly three tools', async () => {
    const h = makeHarness();
    load(h);
    assert.deepStrictEqual(
      h.registered.map((tool) => tool.name),
      ['hyperxosist_search_plan', 'hyperxosist_filter_signals', 'hyperxosist_build_handoff']
    );
  });

  await test('all initial tools are read only', async () => {
    const h = makeHarness();
    load(h);
    h.registered.forEach((tool) => assert.strictEqual(tool.annotations.readOnlyHint, true));
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

  await test('does not expose paid execution', async () => {
    const h = makeHarness();
    load(h);
    const names = h.registered.map((tool) => tool.name);
    ['hyperxosist_build_paid_request', 'hyperxosist_paid_search', 'hyperxosist_execute_payment'].forEach(
      (forbidden) => assert.ok(!names.includes(forbidden), forbidden)
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

  await test('serializable result', async () => {
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
    assert.strictEqual(h.registered.length, 3);
  });

  await test('pre-aborted execution is rejected cleanly', async () => {
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
      ['hyperxosist_search_plan', 'hyperxosist_build_handoff']
    );
    assert.strictEqual(h.errors.length, 1);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
