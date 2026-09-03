'use strict';

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
