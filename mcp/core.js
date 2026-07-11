'use strict';

const HyperXosistAgent = require('../agent-api.js');
const { PAYMENT_POLICY, TOOL_DEFINITIONS } = require('./tools.js');

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
        });
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
