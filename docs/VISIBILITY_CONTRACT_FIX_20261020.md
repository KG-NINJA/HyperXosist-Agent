# Agent visibility response contract correction

Observed 2026-10-20 JST from GET https://api.kgninja.dev/openapi.json (OpenAPI 3.1.0).

## Cause

The pinned catalog introduced by b2848c3 (contract_observed_date 2026-09-07)
expects objects for both `privacy` and `recommended_next_fix`. Current public
OpenAPI and its published 200 example use strings for both. The original tests
constructed public schemas directly from the pin and used object-shaped synthetic
examples, so they did not independently detect the stale pin.

PR #44 reports only the first normalized difference. The normalizer adds
`required: []` and `additionalProperties: true` for object schemas. Sorted key
comparison therefore reports `/properties/privacy/additionalProperties` before
`/properties/privacy/type`. It is not a missing security setting in production.
Both fields differ in type; adding additionalProperties alone cannot repair it.
The exact date and seller commit that changed the public contract are unknown;
the paid generator and an actual paid response were not inspected.

## Minimal correction and security boundary

Change only those two pinned property types from object to string. Preserve all
required fields, comparator behavior, parser size limits, payment policy, prices,
x402 handling, signatures and the other four service entries. No object/string
union, disabled check or blanket schema relaxation is introduced.

The original object schema did not require aggregation_only or enforce any
privacy flag. The public operation separately declares x-privacy-guarantee:
no raw IP, raw UA, wallet addresses or event logs; aggregate-only. This change
leaves the seller and those guarantees untouched. A string privacy notice alone
does not prove runtime data minimization; neither did the old unconstrained object.

## Verification

- Public schema vs old pin: 4/5 response contracts match; visibility fails.
- Same snapshot vs corrected pin: 5/5 response and 5/5 request contracts match.
- Normalized visibility SHA-256 before: a1ed21d19c7d9683b41de2f79759b57ef781fdc789499b70ef5a20f06a5d9529.
- Public and corrected SHA-256: 60a35765db9a9d95ab5db8f7a449874dbfc6a96fe75470ef4e0540a36d6f5f3e.
- 77/77 scoped tests pass: service-windows, revenue-monitor,
  service-validator-observation. Regression uses an independent public metadata
  snapshot; old pin fails, current pin passes, invalid/missing field types fail.
- Structural comparison against main confirms precisely two catalog property
  type changes; all other catalog values and four service entries are identical.
- git diff --check passes.

## Relationship to #44 and rollout

This PR does not copy #44's diagnostics or alter scripts/services-readiness.mjs.
It corrects the data consumed by the existing monitor and buyer. #44 remains an
independent diagnostics improvement. Tests touch different functional areas.

No seller Worker deployment is needed for this correction. Main-branch monitors
consume the pin after merge; published package consumers need their normal release
before using it. Existing PR CI performs unsigned evidence collection without
wallets or payment. Merge/CI status is recorded in the PR, not inferred here.
The next trusted main monitor run must confirm the live unpaid readiness state.
Contract agreement is not proof of paid delivery, settlement, external usage or
revenue, and does not establish that a seller endpoint was offline.
