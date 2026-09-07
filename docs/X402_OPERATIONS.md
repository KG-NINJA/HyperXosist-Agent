# Existing x402 windows: maintain, observe, acquire one real user

The existing revenue-windows workflow now schedules one unsigned audit every six
hours, at 03:17, 09:17, 15:17 and 21:17 Asia/Tokyo (UTC cron 17 0,6,12,18 * * *).
No ChatGPT scheduled task is created. A selected push to main also runs it so the
first published implementation can be verified immediately; same-repository PRs
collect/test only and cannot update the operator issue.

## Operational boundary

Issue #33 holds a strictly validated checkpoint and the latest public aggregate
status. It is deliberately one thread, not one issue per poll. Only material
changes produce comments: payment/contract failures and recovery, official
validation changes, index changes, metadata completeness, new seller-aggregate
high-water marks and increased reconciliation anomalies. The first observation
is a baseline, not a sale. Two consecutive unknown observations produce a warning;
a single outage does not replace last-known counters with zero.

A decrease followed by a rebound cannot manufacture another revenue increment.
Accounting-version changes are explicitly treated as possible historical
recalculation. `matched` and `confirmed_amount` remain seller-reported aggregates;
no independent buyer identity, new settlement or successful delivery is inferred.
No raw payer addresses, transaction hashes, inputs, IPs, payment proofs, tokens
or arbitrary remote messages are written into the public issue.

The collector uses the existing fixed-origin audit: five shared GETs, five
unsigned POSTs and five official validation POSTs (15 requests per run, normally
60 a day before explicit PR/manual runs). It does not sign or pay. The publisher
runs separately, on trusted main only, with an issue-write token sent exclusively
to api.github.com and only to Issue #33. Its exact marker must be present; closing
the issue stops writes rather than automatically reopening it. The workflow does
not accept a user-controlled issue number, repo, URL, script or paid payload.

Changes are serialized and notifications are idempotent across a successful
comment followed by a failed checkpoint write. A malformed checkpoint fails
closed. Run artifacts retain the full safe audit and compact observation for
14 days. The marker inside Issue #33 should not be edited manually. GitHub issue
notifications follow the user's GitHub subscription settings; this is not a
ChatGPT push-notification integration.

GitHub may delay or drop scheduled jobs; public-repository schedules may stop
following inactivity. This is not a 24/7 availability SLA. The workflow cannot
alert about its own complete failure to start without an independent watchdog.
Check the last run/checkpoint during the existing weekly review. If it is older
than 12 hours, inspect Actions and rerun the existing workflow manually. Do not
create a second overlapping schedule to conceal that issue.

## One external-user experiment

Publish [the first-use guide](../first-purchase.html) and link it from the public
agent marketplace. Focus first on the already-used command-error route, and use
the X query route only for a genuine query-building task. Do not buy from yourself,
create fake customers or generate bulk unsolicited outreach. No paid advertising,
wallet funding, discount, subscription or autonomous buyer has been enabled.

The guide makes the initial input, price, local alternative and returned result
clear. Its publication is not customer acquisition. The seven-day measurement
window begins at actual Pages publication; compare equal windows and separate
fresh receipts, settlement evidence, delivery and independent attribution.
For an actual external customer, privately reconcile their request ID, authorized
wallet payment/settlement and returned result. Only that evidence can resolve
an aggregate alert into an independently attributed paid delivery. Public counts
alone cannot localize an increase to a route or diagnose a paid-handler failure.
No new private telemetry endpoint is claimed by this change.

If seven days yields no new independent delivery, inspect actual traffic and
whether the outputs solve a problem worth paying for. Do not respond by adding
more payment rails or purchasing your own services for listing/ranking.

## Keep other work separate

AVU repair is tracked in #34. Even green health is only a prerequisite; do not
promote it automatically or refresh just a timestamp to hide stale cost basis.
AgentOS Swarm's real settlement stays disabled. Base Sepolia stays testnet-only.
The operator reports the production X-query Bazaar fix was deployed outside this
repository; trust fresh probes for current readiness, not the still-Draft #32.
Do not merge/deploy #32 again just to synchronize wording.

## Verification and rollback

Run `node --test test/revenue-monitor.test.mjs` for offline notification tests.
Only `node scripts/revenue-monitor.mjs --collect` performs the fixed public probes.
The publisher refuses PRs, nonmain refs, wrong repos, missing tokens and stale
artifacts. No secrets or mainnet authorization are required for local tests.

To stop the new polling, remove only the `schedule` trigger or disable this
existing Actions workflow. Remove the notify job to keep audits without issue
writes. No seller, payment database or wallet rollback is needed.

References, checked 2026-09-07:
- https://docs.cdp.coinbase.com/x402/seller/get-discovered
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
