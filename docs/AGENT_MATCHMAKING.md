# Agent service matching

An external buyer agent can describe its task, price limit and deadline, receive
a compatible seller offer, and hand it to its host-owned purchase flow. The
matcher reuses the existing free `https://api.kgninja.dev/match` endpoint for five
services and the AVU health/manifest endpoints for a signed artifact receipt.

This is an agent-side integration with six capabilities from **one seller
operator**, KG-NINJA. It is not an installed network of independent agents, an
automatic customer acquisition campaign, or a brokerage-fee system. Buyer agents
must connect voluntarily and have a real need. A match is not a sale.

| Buyer need | `intent` | Exact `requiredCapabilities` value | Scope |
| --- | --- | --- | --- |
| Failed command diagnosis | `command-error` | `command_error_triage` | Rule-based suggestions; no repair execution |
| Public page excerpt | `url-summary` | `public_page_excerpt` | Title and up to 420 text characters; no AI synthesis |
| Shell command pattern check | `shell-safety` | `shell_pattern_assessment` | No sandbox or comprehensive audit |
| KG-NINJA API discovery telemetry | `service-visibility` | `kg_service_discovery_telemetry` | This service only; no arbitrary-site audit |
| Query and X search URL | `x-search` | `x_query_and_url` | No post collection, outreach or guaranteed leads |
| Signed JSON digest-check receipt | `artifact-receipt` | `service_signed_json_digest_receipt` | Service attestation; no real-world truth verification |

Free/local work takes priority when it satisfies the task. In particular,
HyperXosist's human browser flow, MCP planning/filtering/handoff and local hash
comparison remain free. A downstream consumer's actual receipt requirement is a
reason to consider AVU; merely finishing a handoff is not.

## Connect an agent through MCP

From this reviewed source checkout, install dependencies with `npm ci`. Configure
an MCP-capable agent with an absolute path to the new stdio server:

```json
{
  "mcpServers": {
    "kg-service-matching": {
      "command": "node",
      "args": ["/absolute/path/to/HyperXosist-Agent/mcp/matchmaker-server.mjs"],
      "env": {
        "MATCHMAKER_BUYER_OPERATOR_ID": "your-actual-operator-id",
        "MATCHMAKER_ALLOW_BAZAAR": "false"
      }
    }
  }
}
```

Use your actual operator ID. KG-NINJA's own agents should use `kg-ninja`; they
will skip this operator's paid services. The host can also set
`MATCHMAKER_BUYER_ADDRESS` to its public buyer address. These values come from
host configuration, not model arguments. They are useful exclusions, not
independently verified identities. Unknown identity is reported as unknown and
must not be used to claim an external customer purchase.

Tools are `list_agent_offers`, `match_agent_service`, and
`discover_agent_services`. None accepts payment signatures, wallet secrets,
arbitrary service URLs, or payment authorization. The existing production
`https://mcp.kgninja.dev/mcp` tool list has not changed: this new server is local
source until the operator installs it. It is not published as a new npm release.

Call `list_agent_offers` first, then supply a machine-readable demand. Natural
language interpretation stays in the buyer agent; the matching boundary uses
explicit fields. Do not invent a paid requirement when a free solution suffices.

## Use from code or the CLI

```js
import { createAgentMatchmaker } from './agent-matchmaker.mjs';

const matcher = createAgentMatchmaker({ buyerOperatorId: host.operatorId });
const demand = {
  requestId: host.persistedTaskId,
  intent: 'command-error',
  maxPriceUsdc: '0.01',
  expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
  localSolutionSufficient: false,
  requiredCapabilities: ['command_error_triage']
};
const result = await matcher.match(demand);
// result.decision: review | skip | blocked
// result.candidates include exact scope, price, endpoint, input schema and example.
// This example makes only free discovery calls. It does not buy or execute a fix.
```

`host` represents your existing runtime configuration and task store, not an
included wallet or scheduler. A production integration must bind demand input to
the buyer's actual task and enforce per-call and total spending limits outside
the LLM. Matching's price limit is a filter, not financial authority.

```bash
node bin/hyperxosist-marketplace.mjs offers
node bin/hyperxosist-marketplace.mjs match demand.json
npm run marketplace:demo
npm run marketplace:demo -- --live
```

The default demo is offline and checks free alternatives. `--live` uses synthetic
public requests to the free `/match` and GET discovery routes, and reports them
as synthetic. It does not upload the artifact, create a quote, touch a wallet,
call a paid operation, or establish real customer demand. CLI `match` exits 3 for
a blocked demand and 2 for invalid input; inspect JSON for `review` versus `skip`.

## Match-to-purchase handoff

For API services, `decision: review` means `/match` and OpenAPI agree on the
advertised capability, exact price, Base USDC and pinned recipient. These reads
do not prove paid execution is live. `next` contains the request schema and
fixed example, and the existing local `hyperxosist_execute` tool is identified
for X query execution. Other routes require the host's reviewed x402 adapter.
No generic automatic payer is supplied. Always validate the live 402 challenge
against host policy before signing, keep the exact request/intent, and reconcile
uncertain payment or delivery outcomes before another purchase.

For AVU, matching first requires fresh health and available status. Include the
artifact's trusted `sha256`, `mediaType: application/json`, and `byteLength` in
the demand; no artifact bytes leave the process during matching. The host can
then connect the match to the existing buyer module:

```js
const prepared = await matcher.prepareReceipt(result.matchId, {
  jsonText: originalJsonText,
  expectedSha256: trustedDigest,
  allowEvidenceUpload: host.artifactUploadApproved,
  spendPolicy: host.reviewedAVUSpendPolicy,
  idempotencyKey: host.persistedPurchaseIntentId
});
if (prepared.state === 'prepared') {
  // Free precheck completed. Quote and payment have not started.
  // Pass prepared.buyer and prepared.handle to the host purchase coordinator.
}
```

The match must be fresh (at most 60 seconds) and must refer to the same artifact.
Budget and recipient changes are rejected. See [AVU_BUYER.md](AVU_BUYER.md) for
`requestChallenge`, the host wallet callback, paid-state handling and receipt
verification. Those operations are intentionally absent from the new MCP server.
The purchase coordinator still needs durable pending-intent storage, a wallet
with native USDC EIP-3009 support and its own budget/deadline enforcement. The
matcher does not certify wallet interoperability or live paid delivery.

## Discover other sellers

Coinbase documents public Bazaar service search without an API key. To opt in,
the host can set `MATCHMAKER_ALLOW_BAZAAR=true` or construct the matcher with
`allowBazaar: true`. Use generic public service keywords: the search query is
sent to Coinbase. Never use confidential task text.

```bash
node bin/hyperxosist-marketplace.mjs discover "public weather forecast" 0.01
```

The result lists budget-compatible Base USDC entries, with
`automaticPurchaseEligible: false`. The matcher does not follow seller URLs,
execute remote skill instructions, endorse directory claims or add recipients
to an allowlist. A host must review a new seller's capability, independence,
terms, availability and execution adapter before integrating it. This prevents
an untrusted directory result from silently acquiring economic authority.

Official references: [buyer discovery](https://docs.cdp.coinbase.com/x402/buyer/discover-services),
[search API](https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/search-x402-resources),
[seller indexing](https://docs.cdp.coinbase.com/x402/seller/get-discovered).
Discovery access does not create buyers. Seller indexing is tied to settlement
and external indexing; a local manifest or match alone does not establish a
Bazaar listing.

## Evidence and remaining production work

The 2026-09-06 production free `/match` probe returned a valid X-query offer at
0.01 USDC. OpenAPI and catalog projection fixtures record those reads. AVU
reported `degraded` with `cost_basis_fresh=false`. Its cost-basis repair still
requires the current D1 row and separately approved guarded SQL. No D1 or Worker
configuration is changed by this integration. The Bazaar lookup attempt returned
HTTP 502, so external directory visibility remains unverified.

Tests cover the real public discovery schemas, exact decimal budgets, stale or
contradictory metadata, wrong recipients, task scope, free alternatives, known
self-purchases, duplicate/concurrent demands, the bound AVU free precheck, and a
real stdio MCP client. Wallet and paid delivery tests remain mocked; production
purchase success is not claimed.

`diagnostics()` counts local demands, reviews, skips and blocks. It never counts
these as revenue. Repeated identical demands are deduplicated while in flight
and for 60 seconds; request IDs cannot change meaning before their deadline.
The in-memory cache is capped at 256 active demands and is not durable financial
state. Customer payments must be tracked separately through payment verification,
settlement, execution, delivery and result verification. Exclude synthetic tests
and same-operator transfers from external customer revenue. No advertising,
outreach, automatic buyer enrollment or 24/7 hosting was performed.
