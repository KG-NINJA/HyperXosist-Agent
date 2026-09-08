'use strict';
// Synthetic offline fixtures. No real authorization, chain transaction or customer evidence.
const endpoint = 'https://api.kgninja.dev/hyperxosist-query';
const network = 'eip155:8453';
const encoded = value => Buffer.from(JSON.stringify(value)).toString('base64');
const challenge = () => ({x402Version: 2, resource: {url: endpoint}, accepts: [{scheme: 'exact', network,
  asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', payTo: '0x4D7d842536De9Eb491AE2300126B3CDdE7B0aDE3', amount: '10000', maxTimeoutSeconds: 300}]});
const settlement = () => ({success: true, network, transaction: '0x' + 'a'.repeat(64), payer: '0x' + 'b'.repeat(40)});
const output = () => ({status: 'paid', service: 'HyperXosist Query Builder', query: 'Acme -spam', searchUrl: 'https://x.com/search?q=Acme',
  mode: 'live', appliedNoiseTerms: [], excludeTerms: [], generated_at: '2026-09-08T00:00:00.000Z', version: 'synthetic-test',
  payment: {protocol: 'x402', paid: true, price: '$0.01', network, real_revenue: false}});
module.exports = {endpoint, network, encoded, challenge, settlement, output};
