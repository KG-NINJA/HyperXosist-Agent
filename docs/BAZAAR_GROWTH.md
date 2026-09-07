# Grow the existing /fix-error paid route

## Scope and dated baseline

Focus on `https://api.kgninja.dev/fix-error`, preserving its URL, method, current
pricing, network, recipient, fulfillment contract and payment controls. Do not
make AVU recovery or a new buyer network a prerequisite for this existing route.

On 2026-09-07, the Coinbase-operated
[Agentic Market page](https://agentic.market/services/api-kgninja-dev) displayed
one endpoint, `/fix-error`, with **5 calls and 2 payers over the last 30 days**.
These are platform-reported aggregate metrics, not 5 independent customers or
proof of AI autonomy. They are not directly comparable to lifetime local
receipt/settlement totals. The operator reports purchases by other users;
AI-versus-human identity remains unverified.

The marketplace example omitted the input body and displayed generic output
rather than the six-field receipt. The service's OpenAPI already contains real
request/response examples. This is a discovery-to-contract propagation gap, not
a reason to invent a new paid product or to claim metadata is entirely absent.

## Buyer-facing changes in this repository

- `docs/BUY_FIX_ERROR.md`: free preview, real request examples, an explicitly
  authorized CLI purchase with a 10000-atomic-unit cap, result interpretation,
  safe repeat-use conditions and unknown-outcome handling.
- `fix-error-quickstart.json`: machine-readable input/output schemas, examples,
  limitations and host-authorization requirements.
- Linked from the existing `agent-marketplace.json` discovery manifest; offline
  regression checks.

These files are guidance. Publishing them does not update the seller's Worker,
change an indexed Bazaar entry, deploy Remote MCP tools, enroll buyers or
establish a new sale.

## Seller-side follow-through (not applied by this repository)

Work from the current authorized seller source checkout. Record the deployed
version and its route configuration before changing anything. Keep the existing
resource URL; do not fork it into new paid URLs to inflate listing counts.

1. Compare the actual unsigned `/fix-error` 402 challenge, its Bazaar extension,
   the current OpenAPI and the externally indexed resource. Use a redacted
   synthetic input and label this probe as synthetic. Do not sign or pay.
2. Project the current source-of-truth request/response schemas and realistic
   examples into the existing `declareDiscoveryExtension` configuration. Use
   the short `description` in `fix-error-quickstart.json` as proposed copy only
   after confirming its scope against the implementation. Do not independently
   maintain a second drifting payment contract, or claim a schema change is
   deployed because this JSON exists.
3. Validate the unchanged endpoint through the official read-only validator:

   ```sh
   curl --silent --show-error --max-time 30 \
     -X POST https://api.cdp.coinbase.com/platform/v2/x402/validate \
     -H 'Content-Type: application/json' \
     --data '{"resource":"https://api.kgninja.dev/fix-error","method":"POST"}'
   ```

   Confirm `valid: true`, `statusCode: 402`, an accepted simulation, and the
   actual extension contents. An unavailable validation API is unknown, not a
   pass. Validation neither pays nor indexes the resource.
4. After an authorized normal customer settlement, inspect Bazaar extension
   processing and read the indexed entry again. Never buy from yourself to
   manufacture demand, ranking, or an external-revenue claim. Do not claim the
   marketplace display changed before checking it. If correct indexed metadata
   still renders generic examples, report that specific rendering discrepancy
   to the platform instead of weakening the payment contract.

Official references, checked 2026-09-07:
[discovery/ranking](https://docs.cdp.coinbase.com/x402/seller/get-discovered),
[read-only validation](https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/validate-x402-endpoint),
[resource search](https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/search-resources),
[capped CLI payment](https://docs.cdp.coinbase.com/agentic-wallet/cli/skills/pay-for-service).
The documented description limit is 500 characters. Quality and economic usage
both affect discovery; better copy does not guarantee new demand or placement.

## One seven-day experiment, after publication

Keep the product and price unchanged. Test whether a complete, task-specific
buyer guide improves purchases of this one already-used route. Record the
publication/deployment timestamps separately and compare equal time windows.

Primary outcome: newly settled and successfully delivered purchases attributable
to independent buyers, with unknown attribution retained as unknown. Separate
unique paying wallets from verified operators, repeat payers from first-time
payers, refunds from net receipts, and fee-adjusted proceeds from gross volume.
Exclude own-wallet transfers, synthetic probes, CI and monitoring traffic.

Use existing privacy-safe telemetry where it genuinely supports preview -> 402
-> settled -> delivered analysis. Do not add public raw wallets, IPs, request
bodies or payment proofs. Aggregate visit totals are not a person-level funnel;
do not divide unrelated counters and call the result a conversion rate. If
existing records do not support attribution, report the gap before redesigning
analytics. Small samples are directional, not product-market fit.

Success is an actual additional independent paid delivery, not a merge, a
schema read, a rank change, a new listing or a simulated payment. If purchases
do not increase, inspect demand, output usefulness and delivery failures before
adding services. Do not add discounting, paid ads, bulk outreach, subscriptions,
autonomous spending, or a new schedule as part of this metadata experiment.
