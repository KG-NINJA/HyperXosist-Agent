'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { TOOL_DEFINITIONS } = require('../mcp/tools.js');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const load = (file) => JSON.parse(read(file));
const freeTools = [
  'hyperxosist_search_plan',
  'hyperxosist_filter_signals',
  'hyperxosist_build_handoff',
];
const paidTool = 'hyperxosist_execute';

const packageJson = load('package.json');
const agentUse = load('agent-use.json');
const agentTools = load('agent-tools.json');
const discovery = load('.well-known/mcp.json');
const catalog = load('mcp-catalog.json');
const access = load('access-policy.json');
const payment = load('x402-payment.json');

for (const manifest of [agentUse, agentTools, discovery, access]) {
  assert.equal(manifest.version, packageJson.version);
}
assert.equal(packageJson.version, '2.6.0');
assert.equal(agentUse.requiresPaymentForAgentUse, false);
assert.equal(agentUse.requiresPaymentForProductionExecution, true);
assert.equal(agentTools.requiresPaymentForAgentUse, false);
assert.equal(agentTools.requiresPaymentForProductionExecution, true);
assert.equal(access.requiresPaymentForAgentUse, false);
assert.equal(access.requiresPaymentForProductionExecution, true);

assert.deepEqual(agentUse.siteTools.freeTools, freeTools);
assert.deepEqual(agentUse.siteTools.paidTools, [paidTool]);
assert.deepEqual(agentTools.siteTools.freeTools, freeTools);
assert.deepEqual(agentTools.siteTools.paidTools, [paidTool]);
assert.deepEqual(access.surfaces.webMcp.freeTools, freeTools);
assert.deepEqual(access.surfaces.webMcp.paidTools, [paidTool]);

assert.deepEqual(discovery.freeTools, freeTools);
assert.deepEqual(discovery.paidTools, []);
assert.deepEqual(discovery.codeReadyPaidTools, [paidTool]);
assert.equal(discovery.paidToolDeploymentStatus, 'pending-production-worker-deploy');
assert.deepEqual(catalog.tools, freeTools);
assert.deepEqual(catalog.pendingDeploymentTools, [paidTool]);
assert.deepEqual(catalog.codeReadyTools, [...freeTools, paidTool]);
assert.deepEqual(agentUse.remoteMcp.deployedTools, freeTools);
assert.deepEqual(agentUse.remoteMcp.paidTools, []);
assert.deepEqual(agentUse.remoteMcp.codeReadyPaidTools, [paidTool]);
assert.equal(agentUse.remoteMcp.paidToolDeploymentStatus, 'pending-production-worker-deploy');
assert.deepEqual(agentTools.remoteMcp.deployedTools, freeTools);
assert.deepEqual(agentTools.remoteMcp.paidTools, []);
assert.deepEqual(agentTools.remoteMcp.codeReadyPaidTools, [paidTool]);
assert.equal(access.surfaces.remoteMcp.paidToolDeploymentStatus, 'pending-production-worker-deploy');

assert.deepEqual(TOOL_DEFINITIONS.map((tool) => tool.name), [...freeTools, paidTool]);
assert.equal(TOOL_DEFINITIONS.find((tool) => tool.name === paidTool).annotations.readOnlyHint, false);
assert.equal(TOOL_DEFINITIONS.find((tool) => tool.name === paidTool).annotations.destructiveHint, true);

assert.equal(payment.headers.paymentRequired, 'PAYMENT-REQUIRED');
assert.equal(payment.headers.paymentSignature, 'PAYMENT-SIGNATURE');
assert.equal(payment.headers.paymentResponse, 'PAYMENT-RESPONSE');
assert.equal(payment.explicitConfirmationField, 'confirmPayment');
assert.equal(payment.webMcpGeneratesPaymentSignature, false);
assert.equal(payment.agentAutopayRequiresCompatibleWalletOrFacilitator, true);

const webmcp = read('webmcp.js');
for (const name of [...freeTools, paidTool]) assert.match(webmcp, new RegExp(name));
assert.match(webmcp, /confirmPayment/);
assert.doesNotMatch(webmcp, /privateKey|seedPhrase|walletPassword/);

const paidExecution = read('paid-execution.js');
assert.match(paidExecution, /PAYMENT-REQUIRED/);
assert.match(paidExecution, /PAYMENT-SIGNATURE/);
assert.match(paidExecution, /PAYMENT-RESPONSE/);
assert.match(paidExecution, /payment_confirmation_required/);
assert.doesNotMatch(paidExecution, /privateKey|seedPhrase|walletPassword/);

const html = read('index.html');
assert.match(html, /hyperxosist_execute/);
assert.match(html, /Remote MCP Workerの明示的な本番デプロイ/);
assert.doesNotMatch(html, /<dt>Authentication<\/dt><dd>Bearer token<\/dd>/);

const readme = read('README.md');
assert.match(readme, /version-2\.6\.0/);
assert.match(readme, /\| \*\*Version\*\* \| 2\.6\.0 \|/);
assert.match(readme, /hyperxosist_execute/);
assert.match(readme, /pending-production-worker-deploy|explicit production Cloudflare Worker deployment/);
assert.doesNotMatch(readme, /api\.kgninja\.dev\/HyperXosist-Agent\/payment-options\.json/);
assert.doesNotMatch(readme, /Authentication: Bearer token/);
assert.doesNotMatch(readme, /API surface \(v2\.5\)/);

for (const file of ['README.md', 'index.html', 'docs/MCP.md', 'docs/CHATGPT_APP.md', 'workers/remote-mcp/README.md']) {
  assert.doesNotMatch(read(file), /2\.5\.0/);
}

console.log('Access policy consistency tests passed.');
