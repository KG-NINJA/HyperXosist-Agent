# Paid execution: bounded delivery and honest settlement states

The existing `paid-execution.js` bridge now keeps the request deadline alive until
response consumption finishes. Native fetch bodies are limited to 1 MiB; input
serialization happens before any network call. It performs exactly one POST per
invocation and does not create, sign, retry or persist payment authorizations.

## Read the states, not just a Boolean

`paymentAttempted` means the client attempted to transmit a signed request, not
that the server received or settled it. `settlement.state` is `not_observed`,
`invalid_report`, `reported_failure` or `reported_success`. A reported success
requires consistent PAYMENT-RESPONSE / X-PAYMENT-RESPONSE documents, Base network,
a well-formed transaction and payer, and success=true. It is still a SERVER REPORT:
`settlement.independentlyVerified` is false. This client performs no chain lookup.

`paid` remains a compatibility field: true for reported success, false before a
signed attempt or for reported failure, and null when a signed outcome is unknown.
Consumers must not treat null as evidence of no charge. The MCP output schema now
allows null and the `outcome_unknown` stage. Update consumers of the older schema.

`delivery.state` separately records `not_received`, `invalid_result` or `received`.
A 200 response containing HTML, an empty body, malformed data, a demo result or the
wrong query-result schema is not successful delivery. A correct result without a
consistent settlement report remains available to the caller for reconciliation.
No receipt or output-shape check proves that the result actually solved the task:
`delivery.outcomeVerified` remains false.

After any signed 402, timeout, network failure, bad result or uncertain settlement,
`reconciliationRequired=true`, `automaticRetryAllowed=false`, and no new signature
retry template is produced. The client returns the request ID and settlement report
already received even if the response body subsequently times out. Preserve these
privately; the bridge does not log or persist them. Inspect the original wallet
transaction and delivery before authorizing another purchase. This is not durable
idempotency and does not prevent a host from ignoring the returned instruction.

An initial unsigned 402 may expose the one-request authorization handoff only when
the actual challenge matches the existing resource, Base native USDC, 10000 atomic
units and existing recipient, and any echoed challenge matches its header. These
local checks do not replace trusted-wallet policy or cryptographic request binding.
No funds, price, recipient, facilitator or seller handler is changed.

## Publication boundaries

Merging updates the browser bridge served by GitHub Pages and source integrations.
An independently deployed Remote MCP Worker is NOT redeployed by a Pages update;
inspect its live tools and deployment separately. No npm package release is implied.
The purchase preparer stays local-only. Its hostname check now handles trailing
root dots on private names. It is not a DNS/redirect/SSRF defense for the server.
The standalone first-purchase.html is copied without YAML frontmatter, so direct
static hosting and Pages render the same standards-mode document.

## Remaining seller task

Cloudflare Workers Observability and the persistent settlement-to-delivery join
still require the authenticated, identified SELLER deployment. Do not deploy the
Remote MCP Worker or an old Bazaar candidate in place of it. Check existing console
and exception output BEFORE enabling log persistence: turning on Workers Logs
captures existing logging too, not just new allowlisted fields.

Use an allowlisted route ID (unknown paths mapped to `other`), method/status/version,
self-reported synthetic marker, payment-header-present Boolean, and actual lifecycle
events. Keep `verification_attempted`, `settled`, `response_generated` and
`delivery_acknowledged` distinct. HTTP 200 or successful response generation alone
must not be labeled buyer receipt. Do not store raw inputs, headers, signatures,
IPs, wallet addresses, full URLs/query strings or arbitrary exception messages in
logs. Platform-generated metadata must also be checked; custom-log redaction alone
cannot guarantee what the platform retains. Sampled logs are not an exact ledger.

Evidence references checked 2026-09-08:
- https://docs.cdp.coinbase.com/x402/support/faq
- https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/settle-payment
- https://developers.cloudflare.com/workers/observability/logs/workers-logs/
