#!/usr/bin/env node
import { createAgentMatchmaker, listAgentOffers } from '../agent-matchmaker.mjs';
import { sha256 } from '../avu-buyer.mjs';

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--live')) {
  console.error('Usage: node examples/agent-marketplace.mjs [--live]'); process.exit(2);
}
const live = args[0] === '--live';
const noNetwork = async () => { throw new Error('Offline demo must not contact a server'); };
const matcher = createAgentMatchmaker({
  ...(live ? {} : { fetchImpl: noNetwork }),
  buyerOperatorId: process.env.MATCHMAKER_BUYER_OPERATOR_ID || null,
  buyerAddress: process.env.MATCHMAKER_BUYER_ADDRESS || null
});
const jsonText = '{"fixture":"public-synthetic-agent-handoff","ready":true}';
const demand = { requestId: `marketplace-demo-${Date.now()}`, intent: 'x-search', maxPriceUsdc: '0.01',
  expiresAt: new Date(Date.now() + 300000).toISOString(), localSolutionSufficient: !live };
const results = await Promise.all([
  matcher.match(demand),
  matcher.match({ ...demand, requestId: `${demand.requestId}-receipt`, intent: 'artifact-receipt',
    artifact: { sha256: sha256(jsonText), mediaType: 'application/json', byteLength: Buffer.byteLength(jsonText) } })
]);
console.log(JSON.stringify({ mode: live ? 'live_free_discovery' : 'offline', syntheticDemand: true,
  actualCustomerDemand: false, directory: listAgentOffers(), results, diagnostics: matcher.diagnostics() }, null, 2));
