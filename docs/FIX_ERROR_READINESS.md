# /fix-error: discovery-to-purchase readiness

Buyer instructions: [BUY_FIX_ERROR.md](BUY_FIX_ERROR.md).
Machine-readable recipe: [fix-error-quickstart.json](../fix-error-quickstart.json).
Production purchase resource remains `https://api.kgninja.dev/fix-error`.
AVU is a separate service and is not a prerequisite for this route.

## Verify before changing the seller

```sh
npm run test:fix-error-readiness
npm run audit:fix-error -- --live --validate --out audit/fix-error-readiness.json
```

The second command performs six requests to fixed public seller URLs, including
one **unsigned synthetic** POST, plus one optional official validation request.
It cannot sign, pay, access a wallet, change D1, deploy a Worker, follow redirects,
retry a payment, or accept arbitrary URLs. It has bounded responses and timeouts.
Its default invocation without `--live` refuses network access. No credentials
are required or accepted. The official validator is read-only; its response does
not generate a sale or update indexing.

Exit codes: `0` means the implemented unpaid checks passed; `1` means a known
contract/discovery check failed; `2` means evidence is partial; `3` is a script or
argument failure. None means a live paid delivery succeeded. Transport errors,
HTTP 401/403/429/5xx and missing index evidence remain unknown, not success.

The **Fix-error discovery evidence** Actions workflow runs only on its selected
pull-request paths or a manual dispatch. There is no cron or new scheduled task.
Its green conclusion means tests passed and the evidence report was collected;
**read the report's state** to determine readiness. A blocked or partial result
also emits an Actions warning and is written to the job summary. The workflow
uses read-only repository permissions, persists no checkout credential, accesses
no secrets, installs no wallet package, and retains its public aggregate report
for 14 days. Fork pull requests do not trigger the live job.

## What gets checked

The auditor compares current OpenAPI schemas/examples, payment options, free
preview availability, local discovery terms, the real PAYMENT-REQUIRED header,
its body echo, description length, Bazaar input/output examples, and the official
validator response. It pins the existing resource, 0.01 USDC amount, Base network,
native-USDC contract and seller recipient. A change is for review, never silently
adopted as new financial authority.

The report contains public response hashes, allowlisted statuses and aggregate
counts, not raw request logs, customer identifiers, payment credentials or remote
error text. A synthetic marker is sent on the direct probe, but do not assume the
seller recognizes it. Monitoring and validation can increment unpaid counters;
exclude them from demand/paid-conversion measurement.

The `projection` field prepares review-only `declareDiscoveryExtension` options
from the **live OpenAPI**. It is not a deployed extension and is not a replacement
Worker. Verify the installed SDK signature/version and the real seller source
before applying it. Preserve existing extensions and all payment controls.
Do not blindly overwrite a Worker, change domains, mint a second resource URL,
or use a same-operator paid call to manufacture ranking or revenue.

## Seller identity is a gate, not a guess

The public historical proof references `agentos-revenue-cloudflare`, while prior
operator records also identify a `kg-ninja-x402-revenue-gate-mainnet-staging`
Worker. A historical URL is not proof of today's custom-domain deployment.
HyperXosist's `workers/remote-mcp` is the MCP Worker, not necessarily the seller.

Before seller writes, establish the current custom-domain-to-Worker mapping,
deployment ID, source checkout, environment and D1 binding using the authorized
operator environment. Compare current route schemas and the unpaid challenge to
the checked-out code. If these cannot be established, stop seller writes and
report `worker_deployment_identity_verified: false`; continue safe public reads.
Never retrieve or publish raw secrets to solve an identity or connection gap.

## Close the correct gap

1. If OpenAPI/price/challenge terms disagree, fix that precise regression in the
   confirmed seller source before promoting paid use.
2. If the challenge lacks a useful request body or complete paid-envelope output example,
   integrate the reviewed projection in the existing Bazaar extension, test it,
   deploy that seller only, and run the audit again.
3. If the actual challenge and official validator are complete but Agentic
   Market still displays a body-less command or a generic response wrapper,
   record it as an index/rendering discrepancy. Do not change payment logic or
   pretend repository documentation changed the marketplace display.
4. Verify indexing after a legitimate customer settlement and inspect the
   extension-processing result when available. Platform availability and
   indexing/ranking are not controlled by this repository.

## Completion and growth evidence

Keep separate: repository change, Pages publication, seller deployment,
validation/indexing, settlement, result delivery and independent-buyer attribution.
The auditor expressly does not verify a live paid delivery or a buyer's identity.
A payment-compatible endpoint is not proof that an autonomous AI chose to buy.

The dated local aggregate baseline is 15 matched settlement records / 0.15 USDC,
while the marketplace displayed 5 calls / 2 payers in its rolling 30-day window
on 2026-09-07. Treat these as source-reported observations, not interchangeable
customer counts or independently verified lifetime revenue.

Use the existing seven-day experiment in [BAZAAR_GROWTH.md](BAZAAR_GROWTH.md).
Primary outcome: additional independent, settled and delivered purchases. Keep
self-tests, unknown attribution, refunds and fees separate. No false success,
fake customer, unsolicited bulk outreach, advertising spend or recurring task
is created by this audit. A lack of new sales calls for evaluating genuine
output usefulness and buyer need, not repeatedly buying from yourself.

Official references, checked 2026-09-07:
- https://docs.cdp.coinbase.com/x402/seller/get-discovered
- https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/validate-x402-endpoint
- https://docs.cdp.coinbase.com/agentic-wallet/cli/skills/pay-for-service

## Current paid response contract

The fresh public OpenAPI observed at 2026-09-07 06:19 UTC nests diagnostics in
`response.receipt`. The complete paid envelope is not interchangeable with the
inner six-field sample. Recipe v1.1 records both schemas; the dependency-free
`fix-error-response.mjs` parser reads the raw API body and rejects a flat sample
as a paid response. It does not verify settlement or run a suggested command.

The initial audit on head `77df0c3` incorrectly expected a flat response, causing
`openapi_projection` to fail despite the official validator accepting the
endpoint and reporting an active Bazaar entry. The corrected audit keeps the
strict monetary pins, validates the actual nested schema and retains diagnostic
error codes. Description brevity is advisory and cannot alone mark a valid
payment route blocked. Missing examples remain incomplete evidence; unknown
transport failures never become passes.
