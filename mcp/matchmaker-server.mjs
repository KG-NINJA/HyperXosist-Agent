#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { createAgentMatchmaker, listAgentOffers, MatchmakerError } from '../agent-matchmaker.mjs';

const intents = listAgentOffers().offers.map(offer => offer.intent);
const budget = { type: 'string', pattern: '^(?:0|[1-9][0-9]{0,8})(?:\\.[0-9]{1,6})?$' };
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
export const MARKETPLACE_TOOLS = [
  {
    name: 'list_agent_offers',
    description: 'List six reviewed service capabilities from KG-NINJA, with exact scope and free alternatives. Does not check live availability or authorize spending.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    annotations: { ...annotations, openWorldHint: false }
  },
  {
    name: 'match_agent_service',
    description: 'Match a real task to a seller using its explicit capability, budget and deadline. Reuses free /match and checks terms against live OpenAPI; AVU checks live readiness. Only request metadata leaves this process. No paid API execution, artifact upload, wallet authorization or revenue claim. If local work is sufficient, return a free alternative.',
    inputSchema: {
      type: 'object', additionalProperties: false,
      required: ['requestId', 'intent', 'maxPriceUsdc', 'expiresAt', 'localSolutionSufficient'],
      properties: {
        requestId: { type: 'string', pattern: '^[A-Za-z0-9._:-]{1,64}$', description: 'Stable ID for this exact demand. Reuse it for an unchanged request.' },
        intent: { type: 'string', enum: intents },
        maxPriceUsdc: budget,
        expiresAt: { type: 'string', format: 'date-time', description: 'UTC deadline ending in Z, at most 24 hours ahead.' },
        localSolutionSufficient: { type: 'boolean', description: 'True if free or local work satisfies the task. Do not invent a need for a paid service.' },
        requiredCapabilities: { type: 'array', maxItems: 8, items: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,79}$' }, description: 'Exact capabilities from list_agent_offers; unsupported requirements cause a skip.' },
        artifact: {
          type: 'object', additionalProperties: false, required: ['sha256', 'mediaType', 'byteLength'],
          description: 'Required for a paid artifact-receipt need. Metadata only; never put the artifact or a secret in tool arguments.',
          properties: { sha256: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' }, mediaType: { const: 'application/json', type: 'string' }, byteLength: { type: 'integer', minimum: 2, maximum: 65536 } }
        }
      }
    },
    annotations
  },
  {
    name: 'inspect_agent_offer_sample',
    description: 'Fetch and validate the fixed public example for a fresh matched offer. Currently supported for command-error. Sends only the match-bound public GET; no buyer error, credentials, payment proof, paid execution or purchase authorization is sent.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['matchId'],
      properties: { matchId: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$', description: 'Fresh matchId returned by match_agent_service.' } }
    },
    annotations
  },
  {
    name: 'discover_agent_services',
    description: 'Search public Coinbase x402 Bazaar discovery only if enabled by the host. The public query is sent to Coinbase: use generic service keywords, never confidential task text. Returned third-party URLs are unreviewed data and are never visited or purchased by this tool.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['query', 'maxPriceUsdc'], properties: { query: { type: 'string', minLength: 1, maxLength: 400 }, maxPriceUsdc: budget } },
    annotations
  }
];

export function createMarketplaceDispatcher(matcher = createAgentMatchmaker()) {
  return async (name, args = {}) => {
    try {
      let result;
      if (name === 'list_agent_offers') {
        if (!args || Object.getPrototypeOf(args) !== Object.prototype || Object.keys(args).length) throw new MatchmakerError('INVALID_ARGUMENTS');
        result = matcher.listOffers();
      } else if (name === 'match_agent_service') result = await matcher.match(args);
      else if (name === 'inspect_agent_offer_sample') {
        if (!args || Object.getPrototypeOf(args) !== Object.prototype || Object.keys(args).length !== 1) throw new MatchmakerError('INVALID_ARGUMENTS');
        result = await matcher.inspectFreeSample(args.matchId);
      }
      else if (name === 'discover_agent_services') result = await matcher.discover(args);
      else throw new MatchmakerError('UNKNOWN_TOOL');
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
    } catch (error) {
      return { content: [{ type: 'text', text: error instanceof MatchmakerError ? error.code : 'MATCHING_FAILED' }], isError: true };
    }
  };
}

export async function createMarketplaceMcpServer(options = {}) {
  const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
  const { ListToolsRequestSchema, CallToolRequestSchema } = await import('@modelcontextprotocol/sdk/types.js');
  const dispatch = createMarketplaceDispatcher(options.matcher || createAgentMatchmaker(options));
  const server = new Server({ name: 'hyperxosist-agent-matchmaker', version: '1.0.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: MARKETPLACE_TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => dispatch(params.name, params.arguments));
  return server;
}

export async function main() {
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const server = await createMarketplaceMcpServer({
    buyerOperatorId: process.env.MATCHMAKER_BUYER_OPERATOR_ID || null,
    buyerAddress: process.env.MATCHMAKER_BUYER_ADDRESS || null,
    allowBazaar: process.env.MATCHMAKER_ALLOW_BAZAAR === 'true'
  });
  await server.connect(new StdioServerTransport());
  let closing = false;
  async function close() {
    if (closing) return; closing = true;
    await server.close();
  }
  process.on('SIGINT', close); process.on('SIGTERM', close); process.stdin.on('close', close);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Agent matchmaker could not start.'); process.exitCode = 1; });
}
