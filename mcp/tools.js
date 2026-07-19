'use strict';

const PAYMENT_POLICY = Object.freeze({
  planning: 'free',
  humanManualSearch: 'free',
  automatedProductionExecution: 'x402_required',
  estimatedCostUsd: 0.01,
});

const COMMERCE_GUIDANCE = Object.freeze({
  canonicalOpenApi: 'https://api.kgninja.dev/openapi.json',
  paidEndpoint: 'https://api.kgninja.dev/hyperxosist-query',
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

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const TOOL_DEFINITIONS = [
  {
    name: 'hyperxosist_search_plan',
    description:
      'Use only for specialized X (Twitter) research planning: complaints, bug reports, feature requests, product feedback, or community signals. Builds multiple noise-reduced official x.com/search URLs and quality scores. It is not general web search and does not scrape X or collect posts.',
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
      'Use after X posts or tweet text have already been collected. Separates actionable bugs, feature requests, and UX friction from empty praise, engagement bait, and spam. It does not fetch, scrape, or search X.',
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
      'Use to turn previously collected X feedback into a structured Signal-to-Fix package and coding-agent prompt. It does not perform general summarization, search the web, scrape X, or modify source code.',
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
];

module.exports = {
  PAYMENT_POLICY,
  COMMERCE_GUIDANCE,
  TOOL_DEFINITIONS,
  SEARCH_PLAN_OUTPUT_SCHEMA,
  FILTER_OUTPUT_SCHEMA,
  HANDOFF_OUTPUT_SCHEMA,
};

