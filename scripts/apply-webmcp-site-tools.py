from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

WEBMCP_JS = r'''/**
 * HyperXosist ChatGPT Site Tools / WebMCP adapter.
 *
 * Thin browser-only adapter over the existing HyperXosistAgent dispatcher.
 * It intentionally exposes only the local, free, read-only planning/filtering/handoff
 * capabilities. It does not scrape X, navigate externally, call Remote MCP, or perform
 * x402/payment execution.
 */
(function (root) {
  'use strict';

  const STATE_KEY = '__hyperxosistWebMcpState';
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
    } catch (error) {
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
'''

SITE_TOOLS_SECTION = '''        <!-- ChatGPT Site Tools / WebMCP -->
        <section class="agent-section" aria-labelledby="siteToolsTitle">
          <h2 id="siteToolsTitle">ChatGPT Site Tools <span class="pill">WebMCP</span></h2>
          <p>
            ChatGPT Desktop の内蔵ブラウザでは、対応環境で HyperXosist の planning / filtering / handoff を
            Site Tools として直接利用できます。初期3ツールはローカル・read-only・無料です。
          </p>
          <p>
            Site Tools は X をスクレイピングせず、本番検索を自動実行せず、x402 決済も行いません。
            WebMCP は提案中の Web API のため、<code>document.modelContext</code> 対応環境でのみ有効です。
          </p>
        </section>

'''

README_SECTION = '''### ChatGPT Site Tools / WebMCP

The GitHub Pages site includes a thin, dependency-free WebMCP adapter for compatible environments that expose `document.modelContext.registerTool(...)`. In supported ChatGPT Desktop built-in browser environments, ChatGPT can discover three Site Tools directly from the page without a separate MCP connection:

- `hyperxosist_search_plan` — local search-plan generation via `hyperxosist_plan_from_intent`
- `hyperxosist_filter_signals` — local keep-only filtering via `hyperxosist_filter_keep_signals`
- `hyperxosist_build_handoff` — local Signal-to-Fix/coding-agent handoff via `hyperxosist_build_handoff`

All initial Site Tools are **local, read-only, and free**. They do not scrape X, automatically open X search URLs, call the Remote MCP when equivalent local logic exists, perform x402 payment, or expose production automated search. Automated production use of generated search URLs continues to follow the existing x402 policy.

WebMCP is a proposed web API and is feature-detected. Browsers without `document.modelContext.registerTool` continue to use the normal human UI unchanged. Remote MCP remains a separate integration path for clients that connect to `https://mcp.kgninja.dev/mcp`.

'''

CHANGELOG_SECTION = '''## [Unreleased]

### ChatGPT Site Tools / WebMCP
- Added `webmcp.js`, a dependency-free browser adapter using the current `document.modelContext.registerTool(...)` API when available.
- Exposed exactly three local/read-only/free Site Tools for planning, supplied-signal filtering, and engineering handoff by dispatching into the existing `HyperXosistAgent` API.
- Kept X scraping, external navigation, Remote MCP calls, production automated search, wallet actions, and x402 payment outside the WebMCP Site Tools boundary.
- Added zero-dependency WebMCP tests for feature detection, mappings, duplicate initialization, controlled dispatch errors, serialization, abort handling, and paid-tool exclusion.
- Documented the separation between Human UI, Site Tools/WebMCP, Remote MCP, and x402 execution.

'''


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding='utf-8')


def patch_index() -> None:
    path = ROOT / 'index.html'
    text = path.read_text(encoding='utf-8')

    if 'id="siteToolsTitle"' not in text:
        marker = '        <!-- Remote MCP production -->\n'
        if marker not in text:
            raise RuntimeError('index.html Remote MCP marker not found')
        text = text.replace(marker, SITE_TOOLS_SECTION + marker, 1)

    if '<script src="webmcp.js"></script>' not in text:
        old = '  <script src="payment-endpoints.js"></script>\n  <script src="agent-api.js"></script>\n  <script src="app.js"></script>'
        new = '  <script src="payment-endpoints.js"></script>\n  <script src="agent-api.js"></script>\n  <script src="webmcp.js"></script>\n  <script src="app.js"></script>'
        if old not in text:
            raise RuntimeError('index.html script-order marker not found')
        text = text.replace(old, new, 1)

    path.write_text(text, encoding='utf-8')


def patch_package() -> None:
    path = ROOT / 'package.json'
    data = json.loads(path.read_text(encoding='utf-8'))

    files = data.setdefault('files', [])
    if 'webmcp.js' not in files:
        try:
            insert_at = files.index('agent-api.js') + 1
        except ValueError:
            insert_at = 0
        files.insert(insert_at, 'webmcp.js')

    test_cmd = data['scripts']['test']
    if 'node test/webmcp.test.js' not in test_cmd:
        data['scripts']['test'] = test_cmd + ' && node test/webmcp.test.js'
    data['scripts']['test:webmcp'] = 'node test/webmcp.test.js'

    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def patch_readme() -> None:
    path = ROOT / 'README.md'
    text = path.read_text(encoding='utf-8')
    if '### ChatGPT Site Tools / WebMCP' not in text:
        marker = '### MCP: Local and Remote\n'
        if marker not in text:
            raise RuntimeError('README MCP section marker not found')
        text = text.replace(marker, README_SECTION + marker, 1)
    path.write_text(text, encoding='utf-8')


def patch_changelog() -> None:
    path = ROOT / 'CHANGELOG.md'
    text = path.read_text(encoding='utf-8')
    if '### ChatGPT Site Tools / WebMCP' not in text:
        marker = '## [2.5.0] - 2026-07-10\n'
        if marker not in text:
            raise RuntimeError('CHANGELOG 2.5.0 marker not found')
        text = text.replace(marker, CHANGELOG_SECTION + marker, 1)
    path.write_text(text, encoding='utf-8')


def static_checks() -> None:
    index = (ROOT / 'index.html').read_text(encoding='utf-8')
    order = [
        '<script src="payment-endpoints.js"></script>',
        '<script src="agent-api.js"></script>',
        '<script src="webmcp.js"></script>',
        '<script src="app.js"></script>',
    ]
    positions = [index.index(item) for item in order]
    if positions != sorted(positions):
        raise RuntimeError('index.html WebMCP script order is incorrect')

    webmcp = (ROOT / 'webmcp.js').read_text(encoding='utf-8')
    if 'navigator.modelContext' in webmcp or 'provideContext' in webmcp:
        raise RuntimeError('legacy WebMCP API found')
    for forbidden in ('hyperxosist_build_paid_request', 'hyperxosist_paid_search', 'hyperxosist_execute_payment'):
        if "name: '" + forbidden + "'" in webmcp:
            raise RuntimeError('paid execution tool exposed: ' + forbidden)


if __name__ == '__main__':
    write('webmcp.js', WEBMCP_JS)
    write('test/webmcp.test.js', WEBMCP_TEST)
    patch_index()
    patch_package()
    patch_readme()
    patch_changelog()
    static_checks()
    print('WebMCP Site Tools patch applied and static checks passed.')
