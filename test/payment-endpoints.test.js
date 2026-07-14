'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const Agent = require('../agent-api.js');
const Endpoints = require('../payment-endpoints.js');

const production = Endpoints.resolve('production');
const staging = Endpoints.resolve('staging');

assert.equal(Agent.buildPaidRequest({ keywords: 'HyperXosist-Agent' }).endpoint, production.paymentEndpoint);
assert.equal(
  Agent.planFromIntent('Find bug reports about HyperXosist-Agent', { paymentEnvironment: 'staging' }).primaryStep.paidRequest.endpoint,
  staging.paymentEndpoint
);
assert.equal(
  Agent.startAgentSession({ intent: 'Find feedback about HyperXosist-Agent', paymentEnvironment: 'staging' }).payment.paymentOptionsEndpoint,
  staging.paymentOptionsEndpoint
);
assert.equal(Agent.buildSignalToFixPipeline({ productName: 'HyperXosist-Agent' }).links.paymentEndpoint, production.paymentEndpoint);

const sync = spawnSync(process.execPath, ['scripts/sync-payment-metadata.mjs', '--check'], {
  cwd: resolve(__dirname, '..'),
  encoding: 'utf8',
});
assert.equal(sync.status, 0, sync.stdout + sync.stderr);
console.log('Payment endpoint environment tests passed.');
