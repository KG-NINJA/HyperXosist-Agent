#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { createAgentMatchmaker, listAgentOffers, MatchmakerError } from '../agent-matchmaker.mjs';

const matcher = createAgentMatchmaker({
  buyerOperatorId: process.env.MATCHMAKER_BUYER_OPERATOR_ID || null,
  buyerAddress: process.env.MATCHMAKER_BUYER_ADDRESS || null,
  allowBazaar: process.env.MATCHMAKER_ALLOW_BAZAAR === 'true'
});
try {
  const [command = 'help', ...args] = process.argv.slice(2);
  let result;
  if (command === 'offers' && args.length === 0) result = listAgentOffers();
  else if (command === 'match' && args.length === 1) {
    const text = await readFile(args[0], 'utf8');
    if (Buffer.byteLength(text) > 4096) throw new MatchmakerError('DEMAND_TOO_LARGE');
    result = await matcher.match(JSON.parse(text));
    if (result.decision === 'blocked') process.exitCode = 3;
  } else if (command === 'discover' && args.length === 2) result = await matcher.discover({ query: args[0], maxPriceUsdc: args[1] });
  else if (command === 'help' && args.length === 0) result = {
    commands: ['offers', 'match demand.json', 'discover "public service keywords" maxPriceUsdc'],
    mcp: 'node mcp/matchmaker-server.mjs',
    documentation: 'docs/AGENT_MATCHMAKING.md',
    paymentCommands: []
  };
  else throw new MatchmakerError('INVALID_CLI_ARGUMENTS');
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(JSON.stringify({ error: error instanceof MatchmakerError ? error.code : 'INVALID_REQUEST_OR_FILE' }));
  process.exitCode = 2;
}
