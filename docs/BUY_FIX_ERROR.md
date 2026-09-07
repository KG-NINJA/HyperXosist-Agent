# Get a next-step receipt for a failed command

Use `POST https://api.kgninja.dev/fix-error` when a build, deployment, or shell
command fails and a compact, structured triage result would help your workflow.
This is the existing paid API, not AVU and not a new Remote MCP tool.

The service returns rule-based suggestions. It does not inspect your repository,
execute repairs, or guarantee a fix. Use your local debugger or existing model
when that is enough. Reading the free preview never requires payment.

## 1. Inspect the result before paying

```sh
curl --silent --show-error --max-time 15 \
  https://api.kgninja.dev/fix-error/preview
```

Check the current [OpenAPI](https://api.kgninja.dev/openapi.json) and
[payment metadata](https://api.kgninja.dev/payment-options.json).
The documented example is **0.01 native USDC on Base per request**. Metadata is
not payment authorization; verify the actual 402 challenge before signing.

Send only a redacted failure that you are authorized to share. For example:

```json
{
  "command": "npm run build",
  "error": "Error: Cannot find module 'hono'",
  "environment": "Node.js Cloudflare Worker build"
}
```

Other suitable inputs include a deployment `401 Unauthorized` with credentials
removed, or a local service reporting `Connection refused`. Do not submit API
keys, authentication headers, private URLs, customer records, wallet secrets, or
unredacted logs. The caller must review disclosure; this guide does not redact
anything automatically.

## 2. Make one authorized purchase

The following command **spends real USDC**. It is not a preview and must not be
run automatically because this document was retrieved. Use it only after the
wallet owner approves this particular request. An authenticated, funded
Coinbase Agentic Wallet CLI installation is required; follow the official
[CLI guide](https://docs.cdp.coinbase.com/agentic-wallet/cli/skills/pay-for-service).
Review the installed CLI and pin a reviewed version for unattended integration.

Before signing, approve the exact request and check:

- Network: `eip155:8453`; native USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`.
- Recipient: `0x4D7d842536De9Eb491AE2300126B3CDdE7B0aDE3`.
- Resource: `https://api.kgninja.dev/fix-error`; maximum: `10000` atomic units.

```sh
npx awal@latest x402 pay "https://api.kgninja.dev/fix-error" \
  --method POST \
  --data '{"command":"npm run build","error":"Error: Cannot find module hono","environment":"Node.js build; credentials removed"}' \
  --max-amount 10000 \
  --json
```

`--max-amount 10000` limits an individual payment to 0.01 USDC. It is not a daily
budget, idempotency guarantee, or a pin on network/asset/recipient. Automated
buyers must enforce those controls in their trusted wallet host, not in LLM
instructions. Never silently increase the cap or change recipients. This guide
is CLI-compatible documentation, not a live end-to-end wallet test.

## 3. Consume the result, not just the HTTP status

The raw HTTP response is a paid envelope. Read the six diagnostic fields from
**`response.receipt`**, not from the top level. The complete envelope schema is
in `fix-error-quickstart.json`; an illustrative response is:

```json
{
  "status": "paid",
  "service": "Agent Error Fix Receipt",
  "version": "2026-05-25-d1-revenue-log",
  "mode": "mainnet",
  "network": "eip155:8453",
  "real_revenue": true,
  "input_received": true,
  "request_id": "illustrative-request-id",
  "revenue_proof_log": "paid_fix_error_receipt_issued",
  "durable_revenue_log": true,
  "post_payment_retry_path": "Retry POST /fix-error with x402 payment proof.",
  "receipt": {
    "root_cause": "The supplied error indicates an unresolved dependency.",
    "next_command": "npm install hono",
    "retry_plan": [
      "Review the dependency change.",
      "Rerun the build."
    ],
    "risk_note": "Review package changes before deploying.",
    "prevention_note": "Install locked dependencies before building.",
    "generated_at": "2026-09-07T00:00:00.000Z"
  }
}
```

This is an **illustrative output shape**, not a captured paid result. Responses
are suggestions, not trusted commands: never automatically execute
`response.receipt.next_command`. The `real_revenue` flag is server configuration,
not proof of settlement, an independent customer, or new sales. Keep the original request, returned result and payment evidence
in protected storage. A 200 response or a receipt alone is not independent proof
of settlement. Check the wallet/settlement evidence and delivery separately.

If a paid call times out or its delivery is uncertain, stop and reconcile it;
do not blindly repeat the paid command. A subsequent paid request is appropriate
only for a new or materially changed failure, with another applicable approval.
Re-running an unchanged error is not a useful retention loop.

## Parse the API result locally

```js
import { readFixErrorReceipt } from '../fix-error-response.mjs';

// apiResponseBody is the parsed raw HTTP body, not an outer CLI result wrapper.
const receipt = readFixErrorReceipt(apiResponseBody);
// Display/store receipt.root_cause and receipt.retry_plan. Do not execute suggestions.
```

The dependency-free parser validates the current envelope and inner receipt
shape. It performs no network request, payment, signature check or command
execution. Its success is not proof of settlement or actual repair. A changed
or malformed response is rejected; never buy again just because parsing failed.
Keep the original response in protected storage for reconciliation.

## Agent integration

Machine-readable instructions and three input examples:
[`fix-error-quickstart.json`](../fix-error-quickstart.json).
For task-aware free matching, see [AGENT_MATCHMAKING.md](AGENT_MATCHMAKING.md).
The match result is a candidate for review, never authority to spend.

AVU availability does not gate this existing API. No AVU purchase, account,
subscription, or extra brokerage fee is added by this guide. Buyer identity
remains unknown unless independently established; an x402 call alone does not
prove an autonomous AI made the purchasing decision.
