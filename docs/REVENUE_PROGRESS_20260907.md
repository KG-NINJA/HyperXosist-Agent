# Revenue work checkpoint — 2026-09-07 JST

## First pass: 01:02–01:15 JST

Scope: source-only improvements; no merge, deployment, D1 update, wallet call,
live payment, third-party outreach or change to frozen research systems.
Base: HyperXosist main `080099c916ccdbda44848b12cb1e18331ab4bcb7`.

## Verified baseline

| System | Current evidence | Consequence |
| --- | --- | --- |
| HyperXosist #26 | Merged 2026-09-06 14:52:01 UTC; main CI and Pages succeeded | Do not re-open the old implementation or duplicate it |
| HyperXosist #25 | Merged 2026-09-05 15:15:56 UTC | Prior notes calling it unmerged are obsolete |
| HyperXosist #24 | Still open; separate WebMCP work | Avoid overlapping edits |
| AgentOS #7 | Open; head `f24995a2ecf32334937f913c11447d8425854251`; CI succeeded | GPT-6/VPS activation is not demonstrated by CI |
| AgentOS #8 | Open; head `0672eef3f9dab6393701aff43a74afb0f94dc933`; CI succeeded | Revenue controller work already exists; do not duplicate |
| AVU health/manifest | HTTP 200 but `degraded`, v0.4.3, cost basis not fresh | Healthy transport is not permission to sell |
| AVU stats | Delivered 0; settled revenue atomic `0`; 24h quotes 0; reconciliation backlog 0 | No AVU external-sale evidence |
| AVU cost basis | `2026-08-13T02:44:49.432Z` | Current D1 row and approved repair still required |
| Main API OpenAPI/payment-options | HTTP 200; v2.6.0; five paid routes, 0.01 USDC, Base | Advertised readiness only, not a fresh paid E2E test |
| Main API `/health` | HTTP 404 with discovery pointer to `/capabilities.json` | Do not call this a service outage; capabilities returns HTTP 200 |
| Main API revenue integrity | `partial`; 15 captured onchain payments matched to receipts, amount `0.15`; 64 receipts, 49 unmatched; historical backfill pending | Cumulative service-reported baseline, NOT new income from this run or independent external-customer verification |

Direct GET observations: AVU health at `2026-09-06T16:11:21.694Z`, stats generated
at `2026-09-06T16:11:22.156Z`; main API metadata observed at 16:11:33 UTC;
main API integrity/capabilities observed at 16:11:59 UTC. Earlier web fetches
were cached at 15:37 UTC; the later direct GETs supersede those snapshots.

No transaction-level proof or payer-ownership evidence was exposed by the public
integrity summary. Its `confirmed_external_revenue` label cannot independently
establish unrelated customer ownership. System-wide new settled income and net
profit are **unknown**; do not subtract unknown costs from cumulative totals.

Sources: [AVU health](https://agent-economy.kgninja.dev/health),
[AVU stats](https://agent-economy.kgninja.dev/stats),
[AVU manifest](https://agent-economy.kgninja.dev/agent.json),
[AVU contract](https://agent-economy.kgninja.dev/openapi.json),
[main API contract](https://api.kgninja.dev/openapi.json),
[payment options](https://api.kgninja.dev/payment-options.json),
[main API reconciliation](https://api.kgninja.dev/revenue-log/integrity),
[HyperXosist CI](https://github.com/KG-NINJA/HyperXosist-Agent/actions/runs/34040511063),
[AgentOS #8 CI](https://github.com/KG-NINJA/AgentOS-KGNINJA/actions/runs/34043140674).

## Cost-basis recovery: not performed

[Coinbase's official facilitator pricing](https://docs.cdp.coinbase.com/x402/seller/facilitator)
was checked during this pass: first 1,000 onchain transactions/month are free,
then $0.001 each; verification is free. This supports reviewing a 1000-microusd
fee cap, not an unconditional timestamp refresh. The actual current D1 row has
not been read here. Do not manufacture its CAS guard from older logs.

The existing `scripts/avu-cost-basis-review.mjs` produces review-only SQL and its
four SQLite tests pass. Next: obtain the current `control_id=1` row via the
authorized operator path, generate the exact guarded three-column statement,
obtain the required approval, then verify health/stats and an authorized minimal
paid E2E. No service-enable change or Worker deployment is part of that repair.

## Source improvement completed

Added an opt-in, host-owned, POSIX file purchase journal. The buyer durably
claims the stable idempotency key before invoking its authorization callback,
records submission before sending, and retains terminal/unknown state. Separate
processes cannot claim the same key in the same journal. A restart, corrupt or
incomplete record, failed write or expired quote must not trigger another
signature. Only digests, quote and price metadata are stored, never artifact
bytes, payment signatures, raw idempotency keys or credentials.

This is durable exclusion and inspectable reconciliation metadata, **not** a
finished recovery client, proof store, wallet implementation, production
installation, or increased revenue. The no-journal API remains in-process-only
for compatibility. See [buyer integration](AVU_BUYER.md).

Validation on Node 24.19.0:

- Full `npm test` passed, including production OpenAPI metadata comparison.
- Buyer/journal suite: 41 passing after the final async-expiry regression.
- Existing guarded cost-basis SQL helper: 4 passing SQLite tests.
- `npm pack --dry-run`: new journal module included; `git diff --check` clean.
- Paid service/wallet behavior is synthetic in tests; no live money was used.

## Next-pass handoff

1. Read this branch/PR's current status and reviews; keep source changes in the
   same draft PR unless there is a genuinely separate change.
2. Continue safe recovery work: bounded offline verification of saved response
   against the original intent/keys, without authorizing, signing or resubmitting.
   Preserve the distinction between local journal state and settlement proof.
3. Native-USDC wallet compatibility and live E2E still require a reviewed host
   wallet and explicit authorization. Do not mark them complete from fixtures.
4. The available main API may be a nearer sales path than degraded AVU; evaluate
   its existing free sample/product fit before adding infrastructure. No invented
   demand, spam outreach, paid listing or same-operator revenue loops.
5. Runbook repository was previously 404. VPS/Cloudflare private runtime state,
   installed buyer hosts and full-account costs remain unverified here.

## Second pass: 01:58 JST

PR #27 CI completed successfully and no review comments were present. Added an
offline saved-delivery verifier to the same PR. An `unknown` paid submission now
returns protected reconciliation context containing the exact request, policy,
precheck, binding and public keys. Given the saved response, settlement header
and matching journal record, the verifier repeats every receipt/evidence
signature and binding check without network, wallet, signing, resubmission or
journal mutation. Changed context, journal terms, response and settlement are
rejected. The artifact remains protected data and the result remains
service-authenticated rather than independent on-chain proof.
