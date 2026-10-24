# /hyperxosist-query Bazaar integration candidate

**Status: not connected to the production seller. Not deployed.**
This folder is a portable configuration fix and an isolated SDK integration test,
not a new seller, proxy, browser-only metadata patch, or deployment workflow.
The production seller checkout and authenticated deployment route were not
available in this session. Do not describe a merge of this folder as a fix to
`https://api.kgninja.dev/hyperxosist-query`.

## Minimal change in the actual seller

Use the seller's existing `@x402` version, resource server, route map and middleware.
Do not replace its facilitator, accepts, price, payTo, middleware hooks or handler.

```js
import {
  declareDiscoveryExtension,
  bazaarResourceServerExtension,
} from '@x402/extensions/bazaar';
import { addHyperxosistBazaar } from './hyperxosist-bazaar/route.mjs';

// existingRoutes and resourceServer refer to the REAL existing seller objects.
// Insert at their original construction site, BEFORE paymentMiddleware is created.
const routes = addHyperxosistBazaar(existingRoutes, declareDiscoveryExtension);
if (!resourceServer.hasExtension('bazaar')) {
  resourceServer.registerExtension(bazaarResourceServerExtension);
}
// Replace only the route argument of the existing middleware with `routes`.
// Do not create a second payment middleware or redeploy the Remote MCP Worker.
```

The helper targets exactly `POST /hyperxosist-query`, adds only `extensions.bazaar`
and refuses to overwrite an existing Bazaar declaration. Existing price/recipient
objects, hooks, unrelated routes and non-Bazaar extensions remain unchanged.
It has no dependency on Node filesystem APIs and can be bundled into a Worker.

The recorded schemas match the public OpenAPI observed on 2026-09-07. Samples are
**illustrative**, not paid results. Confirm the sample output with the seller's
local generator and current schema before integrating; preserve truthful scope:
query/URL generation, not collection of X posts. The real_revenue sample field is
a configuration-shaped value, not evidence of revenue.

If the identified seller returns an early hand-built 402 before its middleware,
adding this helper alone will NOT fix it. Inspect that path and the verify/settle
path: use the same route declaration to build the PAYMENT-REQUIRED header, any
body echo and the discovery data passed to the facilitator. Do not glue a new
extension onto only a public JSON file or post-process only the visible header.

## Verification

The local fixture is deliberately not a production server. Its facilitator
throws if any verify or settle operation is attempted. Tests use genuine x402
Hono middleware to reproduce an unsigned 402 without Bazaar and prove that the
route declaration plus registered extension emits a complete Bazaar block.
No wallet, private key, real payment or remote API is used by these tests.

```sh
npm install --ignore-scripts --no-audit --no-fund
npm test
```

Exact direct dependency pins in package.json are **test-only compatibility pins**,
not an instruction to downgrade or replace any production dependency. Use the
seller's own reviewed lockfile for actual integration and repeat the tests there.
The CI-generated lockfile is retained as test evidence.

After authorized deployment, make one unsigned request to the same canonical URL
and check `PAYMENT-REQUIRED` decoded JSON contains `extensions.bazaar.info` and
`extensions.bazaar.schema`. Compare the header and existing body echo. Keep
amount `10000`, Base `eip155:8453`, native USDC and the current payTo unchanged.
Then run the existing read-only audit in HyperXosist-Agent:

```sh
node scripts/services-readiness.mjs --live --validate --out audit/revenue-windows.json
```

Success for THIS repair requires /hyperxosist-query's real response to contain the
extension and the official validator to report valid=true / simulation=accepted.
A sandbox test passing is not that evidence. A successful deployment or validation
is not a customer payment and does not itself establish Bazaar indexing.

## Current handoff requirement

Identify the actual seller checkout, custom-domain-to-Worker mapping and deployment
revision in the authorized operator environment. Historical candidate paths were
`/root/cloudflare-stripe-revenue/src/worker.js` and `KGstack/src/index.ts`; neither
has been verified as today's deployed source. Do not guess a Worker or expose
credentials. No production update is authorized merely by finding a similarly
named repository. Once identity is established, apply the narrow configuration
change, run tests, deploy the existing seller and perform the unsigned checks above.

Official references:
- https://docs.cdp.coinbase.com/x402/seller/get-discovered
- https://github.com/x402-foundation/x402/tree/main/typescript/packages/extensions/src/bazaar
- https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/validate-x402-endpoint
