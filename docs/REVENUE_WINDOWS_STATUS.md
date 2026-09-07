# Revenue-window snapshot — 2026-09-07

This is a dated observation, not a live availability guarantee and not a paid E2E.
Source: PR #31 evidence run 34094313130, captured at 2026-09-07 07:12:21 UTC.

| Existing resource | Unsigned 402 / pinned terms / contracts | CDP response | Index observation |
|---|---|---|---|
| /fix-error | Passed | valid=true; accepted simulation | active=true |
| /summarize-url | Passed | valid=true; accepted simulation | index=null (not indexed) |
| /shell-risk-check | Passed | valid=true; accepted simulation | index=null (not indexed) |
| /agent-visibility-report | Passed | valid=true; accepted simulation | index=null (not indexed) |
| /hyperxosist-query | Passed | valid=false; rejected simulation; missing Bazaar extension | index=null (not indexed) |

All five routes have buyer instructions and pinned result schemas in the new
[shared guide](../services.md) and [machine catalog](../service-offers.json).
This publishes a direct-URL integration path, not a new Bazaar listing. A valid
unsigned challenge does not prove current paid execution or settlement.

The other four routes also have missing or incomplete output examples in live
OpenAPI/discovery metadata. The published schemas document the intended result
shape but do not update those server responses. Fix the actual seller metadata
rather than replacing the working payment implementation. In particular, do not
market /hyperxosist-query as Bazaar-ready until its existing declaration is
repaired in the identified seller Worker and live validation accepts it.

AVU returned a fresh degraded health response with cost_basis_fresh=false and is
not promoted. Testnet-only trade execution and disabled Swarm settlement stay
outside real-money revenue acceptance.

The initial audit expected the documentation's shorter check names. The actual
CDP validator uses endpoint_reachable and valid_json; the auditor now recognizes
both observed and documented equivalents without ignoring any failed required
check. Unknown formats remain unknown, not a claimed official rejection. The
raw valid/simulation/index observations above were retained independently.

Next production change: verify the authorized custom-domain-to-Worker mapping,
restore /hyperxosist-query Bazaar metadata, complete truthful output examples for
the additional routes, then repeat the unpaid audit. First independent customer
settlement and delivered results remain separate evidence; no self-buying for
ranking or new-revenue claims. See [runbook](REVENUE_WINDOWS.md).
