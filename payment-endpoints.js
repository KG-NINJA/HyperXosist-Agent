'use strict';

(function exposePaymentEndpoints(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HyperXosistPaymentEndpoints = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPaymentEndpoints() {
  const environments = Object.freeze({
    production: Object.freeze({
      name: 'production',
      baseUrl: 'https://api.kgninja.dev',
    }),
    staging: Object.freeze({
      name: 'staging',
      baseUrl: 'https://kg-ninja-x402-revenue-gate-mainnet-staging.fuwafuwow.workers.dev',
    }),
  });

  function resolve(environment) {
    const name = String(environment || 'production').trim().toLowerCase();
    const selected = environments[name];
    if (!selected) throw new Error(`Unknown HyperXosist payment environment: ${name}`);
    return Object.freeze({
      environment: selected.name,
      baseUrl: selected.baseUrl,
      paymentEndpoint: `${selected.baseUrl}/hyperxosist-query`,
      paymentOptionsEndpoint: `${selected.baseUrl}/payment-options.json`,
      pricingEndpoint: `${selected.baseUrl}/pricing.json`,
      discoveryEndpoint: `${selected.baseUrl}/agent.json`,
      x402DiscoveryResourcesEndpoint: `${selected.baseUrl}/.well-known/x402/discovery/resources`,
      buyEndpoint: `${selected.baseUrl}/buy`,
    });
  }

  return Object.freeze({ defaultEnvironment: 'production', environments, resolve });
});
