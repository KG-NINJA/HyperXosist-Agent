# Revenue windows: operate the existing seller, not a new payment stack

## Scope

`service-offers.json` records the five current paid resources on api.kgninja.dev.
`services.md` is the shared buyer guide; `service-receipts.mjs` checks each recorded
raw API result locally. Monetary terms are fixed to the existing 0.01 Base native
USDC recipient. The live challenge still needs independent host authorization.
No new paid endpoint, seller deployment, wallet integration, price change,
D1 migration, advertising spend, or scheduled task is included.

## Read-only route-by-route audit

```sh
node --test test/service-windows.test.mjs
node scripts/services-readiness.mjs --live --validate --out audit/revenue-windows.json
```

The audit makes five shared metadata/health GET requests, five unsigned synthetic
POSTs (one for each existing resource), and five optional official validation
POSTs. It never signs or follows a paid retry. All origins and resource paths are
fixed; no credentials, arbitrary targets, redirects, or remote command execution
are accepted. The response size and each request duration are bounded. Validation
is explicitly opted in; running without `--live` refuses network access.

The existing `fix-error-readiness.yml` workflow now runs this five-route audit,
plus the previous single-route regression tests. It retains read-only repository
permissions, no secrets, no persisted checkout credentials, and no cron. It runs
for selected same-repository PR paths or manual dispatch. An evidence job passing
means the report was collected; inspect individual fields before drawing a
readiness conclusion. Original `audit:fix-error` remains usable independently.

Per resource the report separates:
- `payment_readiness`: pinned OpenAPI/catalog, input/output contracts, real 402
  response, monetary terms and body/header continuity when an echo is present.
- `official_validation`: accepted, rejected or unknown.
- `bazaar_index`: active, inactive, explicitly not indexed, or unknown.
- `metadata_gaps`: incomplete input/output examples and local discovery gaps.
- `paid_delivery_verified` and `new_external_revenue_verified`: always false for
  this unpaid audit. No protocol probe is a customer purchase.

A complete 402 challenge can be payable without being indexed. Official validation
does not itself pay or index an endpoint. Do not conflate an unlisted route with a
broken payment service, or advertise an unlisted route as already indexed.
Incomplete examples can obstruct integration but do not prove payment failure.
Do not relax the payment or schema checks to make a report green.

## Close gaps in the correct system

The source snapshot is linked to public OpenAPI and the seller catalog. Changes
in schema types, required fields, additional-property rules, or monetary terms
must be reviewed rather than silently adopted. Update schemas and tests together.
The local validator supports only the subset used by these pinned schemas; it is
not a general JSON Schema engine. Do not pass untrusted schemas into it.

For a seller-side metadata gap, first identify the current custom-domain-to-Worker
mapping, deployment revision, checked-out seller source and authorized Cloudflare
write path. The remote-MCP Worker in HyperXosist is not the seller Worker. The
historical agentos-revenue-cloudflare and mainnet-staging names are not enough to
identify the current deployment. Preserve all payment-critical configuration.

If OpenAPI or Bazaar examples are incomplete, correct only those examples to the
actual result contract in the identified seller. Do not invent observed output,
overwrite the Worker from a guessed implementation, or create new URLs to inflate
listings. Recheck actual 402 metadata and index status after legitimate customer
settlement. No self-buying for ranking or fabricated external revenue.

## Excluded systems

AVU health is inspected separately. Stale timestamps, degraded health, or
`cost_basis_fresh=false` prevent promotion. Even fresh green health is only a
prerequisite: quote binding, authorized payment and signed delivery remain separate
checks. Do not refresh only a database timestamp to conceal a stale cost basis.
Base Sepolia research stays TESTNET ONLY. AgentOS Swarm real settlement stays off.

## Measure useful paid delivery, not vanity counts

Keep external settled-and-delivered purchases, self-tests, unknown attribution,
refunds and fees separate. Never classify another wallet as an independent person
without supporting evidence. Compare equal windows after actual publication.
Unpaid synthetic probes and official validation can increment traffic counters;
exclude them from demand or conversion claims. No buyer identity is inferred from
HTTP 402, a paid response label or User-Agent. Success is an additional useful,
independently attributable paid delivery, not merging this change.

Official references:
- https://docs.cdp.coinbase.com/x402/seller/get-discovered
- https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/validate-x402-endpoint
- https://docs.cdp.coinbase.com/agentic-wallet/cli/skills/pay-for-service
