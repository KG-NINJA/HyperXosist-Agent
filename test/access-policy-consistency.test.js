'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const json = (file) => JSON.parse(read(file));

const policy = json('access-policy.json');
const use = json('agent-use.json');
const tools = json('agent-tools.json');
const catalog = json('mcp-catalog.json');
const discovery = json('.well-known/mcp.json');
const Agent = require('../agent-api.js');

assert.equal(policy.humanUi.paymentRequired, false);
assert.equal(policy.siteTools.paymentRequired, false);
assert.equal(policy.remoteMcp.authenticationRequired, false);
assert.equal(policy.remoteMcp.paymentRequired, false);
assert.equal(policy.productionExecution.paymentRequired, true);
assert.equal(policy.productionExecution.authentication, 'x402-payment-proof');

assert.equal(use.requiresPaymentForAgentUse, false);
assert.equal(use.requiresPaymentForProductionExecution, true);
assert.equal(use.remoteMcp.authentication, 'none');
assert.equal(use.remoteMcp.authenticationRequired, false);
assert.equal(use.siteTools.readOnly, true);
assert.equal(tools.requiresPaymentForAgentUse, false);
assert.equal(tools.requiresPaymentForProductionExecution, true);
assert.equal(tools.remoteMcp.authentication, 'none');
assert.equal(catalog.server.authentication, 'none');
assert.equal(discovery.authentication, 'none');

assert.equal(Agent.agentUseRequiresPayment, false);
assert.equal(Agent.productionExecutionRequiresPayment, true);
assert.equal(Agent.paymentRequiredScope, 'automated-production-execution-only');

const index = read('index.html');
assert.match(index, /Free MCP authentication<\/dt><dd>Public \/ none/);
assert.doesNotMatch(index, /<dt>Authentication<\/dt><dd>Bearer token<\/dd>/);
const wrangler = read('workers/remote-mcp/wrangler.jsonc');
assert.match(wrangler, /"HYPERXOSIST_MCP_PUBLIC_FREE_ACCESS": "true"/);
console.log('Access policy consistency tests passed.');
