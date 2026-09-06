# Optional signed receipts for artifact handoffs

Use this adapter when a consumer or audit workflow needs a service-signed
execution record for a JSON artifact. HyperXosist planning, filtering, and
handoff remain free. A local hash comparison is the default. AVU adds the
service's Ed25519 signature; it does not prove the artifact's truth, provenance,
quality, or actual fulfillment, and is not an independent third-party audit.

The Node.js module is `avu-buyer.mjs`. It does not add a deployed MCP tool, require
a new Worker, or manage a wallet. The module works from this source checkout;
an npm release is a separate action. The agent-readable entry is `avu-buyer.json`.

## Try without paying

```sh
node examples/avu-artifact-handoff.mjs
node examples/avu-artifact-handoff.mjs --status
```

The first command runs offline with synthetic feedback. The second makes only
GET requests to the fixed service origin. It exits 3 when purchasing is blocked,
2 when the check cannot be completed, and 0 when the advertised service is ready.
Readiness is not proof of successful payment or customer demand.

## Integrate into a buyer host

Keep the original artifact in the host's protected store. Prefer sending a small
manifest containing the artifact digest and explicit handoff policy. This records
a check of that manifest; it does not claim AVU examined the underlying artifact.
If checking the original artifact is required, upload those exact JSON bytes only
after the owner authorizes their disclosure. The maximum is 65,536 UTF-8 bytes.

```js
import { createAVUBuyer } from './avu-buyer.mjs';
import { createFilePurchaseJournal } from './avu-purchase-journal.mjs';

// Inputs below come from your trusted workflow and host configuration.
// Do not derive a supposedly trusted expected digest from an untrusted record.
export async function obtainHandoffReceipt({
  exactJsonBytesAsText, trustedExpectedDigest, clientRequestId, idempotencyKey,
  requiresSignedReceipt, uploadAuthorized, reviewedPolicy, authorizedWallet,
  privateJournalDirectory
}) {
  const journal = createFilePurchaseJournal({ directory: privateJournalDirectory });
  const previous = journal.inspect(idempotencyKey);
  if (previous) return { state: 'reconciliation_required', previous };
  const buyer = createAVUBuyer({ purchaseJournal: journal });
  const prepared = await buyer.prepare({
    jsonText: exactJsonBytesAsText,
    expectedSha256: trustedExpectedDigest, // "sha256:<64 lowercase hex>"
    clientRequestId, idempotencyKey,
    requiresSignedReceipt, allowEvidenceUpload: uploadAuthorized,
    spendPolicy: reviewedPolicy
  });
  if (prepared.state !== 'prepared') return prepared;

  // Creates a free quote; still no wallet call or payment.
  await buyer.requestChallenge(prepared);
  // pay() must durably claim the stable key before invoking the wallet.
  // A second process with the same directory/key cannot authorize it again.

  return buyer.pay(prepared, {
    // A host-owned function, not a model-supplied tool argument or boolean.
    // It may use an already authorized budget or obtain human approval.
    // Return null to decline, or a standard base64 PAYMENT-SIGNATURE value.
    authorizePayment: request => authorizedWallet.authorizeX402(request)
  });
}
```

### Durable purchase exclusion and restart handling

The host must provision an absolute, owner-only (mode `0700`) directory on a
durable local POSIX filesystem before creating the journal. Keep it outside this
repository and outside telemetry, shared folders and artifact uploads. This
adapter requires working file and directory `fsync`; it does not claim Windows,
network-filesystem or multi-machine guarantees. A host with those requirements
must supply a reviewed transactional implementation of `claim(key, metadata)`
and `record(ticket, state)` with the same exclusion and durability guarantees.
Do not silently fall back to an in-memory store on persistence errors.

The journal atomically claims the idempotency key before calling the wallet,
records `submitting` before sending the signed request, and records `delivered`,
`unknown` or `refused` afterward. It contains request/evidence/binding digests,
quote ID, terms and expiry, **not** the artifact bytes, raw idempotency key,
wallet signature, raw HTTP response or private keys. Digests and quote metadata
are still private operational information. `delivered` records the buyer's
signature verification result; the journal itself is not settlement evidence.

Every recovered claim excludes another authorization, even if the process died
before writing its complete metadata. Expiry does not release it. After a
restart call `journal.inspect(stableKey)` and reconcile the exact quote with the
host's protected response/settlement evidence. Do not delete a journal entry or
mint another key to work around an unknown result. The host must assign stable
keys to business intents and use the same journal across workers/restarts;
arbitrarily different keys or directories are not deduplicated.

This change provides durable **exclusion and inspectable metadata**, not automatic
recovery, a settlement lookup client, or an operator reconciliation UI. Returned
delivery evidence must still be saved in the host's separate protected store.
Without a `purchaseJournal`, the buyer retains its original in-process-only
behavior for compatibility; use the durable configuration for live integration.

`reviewedPolicy` must contain exactly these fields, set by the buyer's host:

```json
{
  "policy_version": "agent-economy/precheck-policy/2.0",
  "max_amount_atomic": "10000",
  "network": "eip155:8453",
  "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "pay_to": "0x4D7d842536De9Eb491AE2300126B3CDdE7B0aDE3"
}
```

This example is the advertised 0.01 USDC offer observed on 2026-09-06, not an
instruction to trust these terms forever. Verify the payee independently and
approve the policy locally. Never silently copy changed terms into the policy.
The module checks the authoritative challenge against the host's policy using
integer atomic amounts. Prices in `prepare` are previews; the reviewed challenge
is authoritative.

The wallet callback receives the original `paymentRequired` document, bound
quote, host policy, purpose and idempotency key. Its implementation must preserve
x402 extensions and the accepted requirement's `extra` fields, including the
service's binding digest. It must sign the advertised Base USDC EIP-3009 transfer
and restrict its expiry to the quote. Return the SDK-generated encoded payload;
do not hand-assemble signatures or drop custom binding fields. Generic SDK
wrappers that automatically pay every 402 must not be used as `fetchImpl`.
Permit2, unlimited approvals, private-key inputs, automatic paid retries and
wallet setup are intentionally outside this adapter's interface.

## What happens at each stage

| Method / result | Effect |
| --- | --- |
| `prepare`, signed receipt not needed | Local JSON/digest check only; zero network calls |
| `prepare`, service degraded | Returns exact blocker; no artifact upload or quote |
| `prepare`, appropriate and available | Free precheck, canonical receipt/hash checks, MCP card and public key reads |
| `requestChallenge` | Free quote and unsigned 402, identical intent and idempotency key |
| `pay` | Explicit host authorization, at most one signed submission per session |
| `delivered`, outcome `pass` or `fail` | Both are delivered paid checks; no automatic repurchase |
| `unknown` | Payment may have settled; reconcile the saved quote before any new purchase |

Local events contain only stage, reason code and timestamp. `buyer.events()` can
be counted by the buyer host for opt-ins, blocked attempts, prechecks, quotes,
authorization refusals and verified deliveries. It sends no analytics to the
operator. These are integration metrics, not independently verified customers
or revenue. Save `rawResponse` and `paymentResponse` in the host's protected
evidence store; do not put payment proofs or raw artifacts in public logs.

## Verification and limits

The adapter checks service freshness and availability; local request/evidence
digests; unsigned precheck integrity; paid binding continuity; cap, asset,
network, payee, resource and quote expiry; wallet payload terms; Ed25519 evidence
and receipt signatures; checks digest; and consistency of the reported settlement
transaction. Keys are obtained over HTTPS from the fixed service origin before
signing. This is service-authenticated evidence, not independent on-chain proof.

Tests include a real free-precheck response, schema-based mocked quotes/402s,
ephemeral Ed25519 signing, changed terms, wrong signatures, receipt mismatch,
quote expiry, double-call races and indeterminate delivery. No production 402 or
paid delivery was captured during this implementation because the service was
degraded. A buyer wallet's compatibility with the service-specific binding still
requires an explicitly authorized end-to-end purchase after recovery.

## Operator recovery

Observed 2026-09-06: `cost_basis_fresh=false`, service `degraded`, settled revenue
and delivered transactions zero. A successful free precheck does not clear this
blocker. The operator's older fee-refresh script also updates `updated_by`, so it
does not meet a request to modify only three columns. Do not use that script for
the narrowly authorized repair.

Read the production row first in the Cloudflare D1 console:

```sql
SELECT * FROM runtime_controls WHERE control_id = 1;
```

Export that single row as a JSON object, then prepare a reviewable statement:

```sh
node scripts/avu-cost-basis-review.mjs --row current-row.json --fee-checked-at <UTC-ISO-review-time>
```

This source-checkout helper only prints SQL. It never calls Cloudflare. Its
compare-and-swap conditions refuse the update if price, service state or the
reviewed row changed; a SQL-level deadline refuses execution after 24 hours.
It updates exactly the three requested columns and preserves `updated_by`.
Do not interpret successful SQL generation as approval or execution.

Only after reviewing that row, confirming current official facilitator pricing,
displaying the concrete SQL and receiving operator approval, apply the approved
three-column update. This change neither deploys a Worker nor enables a service.
The source code available for the earlier release expires the reviewed fee basis
after 24 hours; verify the current runtime's interval. A perpetual timestamp
refresh without checking current fee terms would defeat the control.

Recheck `/health`, `/stats`, `/agent.json`, then an authorized minimal purchase
and signed delivery. Separate self-tests from external customer purchases.

Sources: [service OpenAPI](https://agent-economy.kgninja.dev/openapi.json),
[verification recipes](https://agent-economy.kgninja.dev/verification-recipes.json),
[receipt verification](https://agent-economy.kgninja.dev/docs/reproducible-x402-receipts),
[Coinbase facilitator pricing](https://docs.cdp.coinbase.com/x402/seller/facilitator).
