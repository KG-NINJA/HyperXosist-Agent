/**
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
