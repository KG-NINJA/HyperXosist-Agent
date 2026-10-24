/**
 * Seller-side integration candidate, NOT installed on api.kgninja.dev.
 * The host supplies its installed official declareDiscoveryExtension helper.
 * Pure configuration transformation: never handles payments or changes accepts.
 */
export const ROUTE_KEY = 'POST /hyperxosist-query';
export const RESOURCE = 'https://api.kgninja.dev/hyperxosist-query';
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const freeze = x => {
  if (x && typeof x === 'object') { Object.values(x).forEach(freeze); Object.freeze(x); }
  return x;
};

// Recorded from the seller's public OpenAPI on 2026-09-07; not a new API contract.
export const INPUT_SCHEMA = freeze({
  type: 'object', additionalProperties: false,
  properties: {
    keywords: { type: 'string' }, exactPhrase: { type: 'string' },
    fromUser: { type: 'string' }, excludeWords: { type: 'string' },
    lang: { type: 'string', pattern: '^[a-z]{2}$' },
    minFaves: { type: ['integer', 'string'], minimum: 0 },
    minRetweets: { type: ['integer', 'string'], minimum: 0 },
    mode: { type: 'string', enum: ['live', 'top'] },
    excludeLinks: { type: 'boolean' },
    noise: {
      type: 'object', properties: {
        enabled: { type: 'boolean' },
        preset: { type: 'string', enum: ['low', 'medium', 'high'] },
        removed: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  required: ['keywords'],
});
export const OUTPUT_SCHEMA = freeze({
  type: 'object', additionalProperties: false,
  required: ['status', 'service', 'query', 'searchUrl', 'mode', 'appliedNoiseTerms',
    'excludeTerms', 'generated_at', 'version', 'payment'],
  properties: {
    status: { const: 'paid' }, service: { const: 'HyperXosist Query Builder' },
    query: { type: 'string' }, searchUrl: { type: 'string', format: 'uri' },
    mode: { type: 'string', enum: ['live', 'top'] },
    appliedNoiseTerms: { type: 'array', items: { type: 'string' } },
    excludeTerms: { type: 'array', items: { type: 'string' } },
    generated_at: { type: 'string', format: 'date-time' }, version: { type: 'string' },
    payment: {
      type: 'object', additionalProperties: false,
      required: ['protocol', 'paid', 'price', 'network', 'real_revenue'],
      properties: {
        protocol: { const: 'x402' }, paid: { type: 'boolean' },
        demo: { type: 'boolean' }, bypass: { type: 'string' },
        price: { type: 'string' }, network: { type: 'string' },
        real_revenue: { type: 'boolean' },
      },
    },
  },
});

export const INPUT_EXAMPLE = freeze({ keywords: 'frontier AI', lang: 'en', noise: { enabled: false } });
// Illustrative contract sample only, NOT a captured paid response or settlement.
// Confirm values against the identified seller's local result generator before deployment.
export const OUTPUT_EXAMPLE = freeze({
  status: 'paid', service: 'HyperXosist Query Builder', query: 'frontier AI lang:en',
  searchUrl: 'https://x.com/search?q=frontier%20AI%20lang%3Aen', mode: 'live',
  appliedNoiseTerms: [], excludeTerms: [], generated_at: '2026-09-07T00:00:00.000Z',
  version: 'illustrative-schema-example',
  payment: { protocol: 'x402', paid: true, price: '$0.01', network: 'eip155:8453', real_revenue: true },
});

export function discoveryOptions() {
  // A fresh copy protects subsequent requests from mutation by a framework/SDK.
  return structuredClone({
    method: 'POST', bodyType: 'json', input: INPUT_EXAMPLE, inputSchema: INPUT_SCHEMA,
    output: { example: OUTPUT_EXAMPLE, schema: OUTPUT_SCHEMA },
  });
}

/**
 * Add ONLY extensions.bazaar on the existing exact paid route.
 * SDK import belongs in the seller so its own reviewed/locked version is reused.
 * No mutation of routes, accepts, hooks, description, MIME type or other extensions.
 */
export function addHyperxosistBazaar(routes, declareDiscoveryExtension) {
  if (!record(routes) || typeof declareDiscoveryExtension !== 'function') {
    throw new Error('INVALID_BAZAAR_INTEGRATION_ARGUMENTS');
  }
  if (!Object.hasOwn(routes, ROUTE_KEY)) throw new Error('EXACT_PAID_ROUTE_NOT_FOUND');
  const current = routes[ROUTE_KEY];
  if (!record(current) || !Object.hasOwn(current, 'accepts') || current.accepts == null) {
    throw new Error('EXISTING_PAID_CONFIG_REQUIRED');
  }
  if (current.extensions !== undefined && !record(current.extensions)) {
    throw new Error('INVALID_EXISTING_EXTENSIONS');
  }
  const existing = current.extensions ?? {};
  if (Object.hasOwn(existing, 'bazaar')) throw new Error('BAZAAR_ALREADY_DECLARED_REVIEW_EXISTING');
  const declared = declareDiscoveryExtension(discoveryOptions());
  if (!record(declared) || Object.keys(declared).length !== 1 || !record(declared.bazaar) ||
      !record(declared.bazaar.info) || !record(declared.bazaar.schema)) {
    throw new Error('UNSUPPORTED_BAZAAR_SDK_RESULT');
  }
  return {
    ...routes,
    [ROUTE_KEY]: { ...current, extensions: { ...existing, bazaar: declared.bazaar } },
  };
}
