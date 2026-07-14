# Security Policy

## What this project is

HyperXosist Agent is a **static** query builder. It does not:

- store user API keys for X/Twitter
- scrape or proxy X content
- require OAuth for the human UI

Human browser history and noise settings stay in **localStorage** on the user’s device.

## Payment / x402

Automated agent use is intended to go through the configured **external** x402 Worker:

- Payment verification and settlement happen on that Worker, not on GitHub Pages.
- Do not treat this static site as a payment verifier.
- See `x402-payment.json` for endpoints and expected `402` / `200` behavior.

## Reporting a vulnerability

If you discover a security issue (especially around payment metadata, open redirects, or XSS in the static UI):

1. Prefer a private report to the repository owner ([KG-NINJA](https://github.com/KG-NINJA)).
2. Do not open a public issue with exploit details until a fix is available.
3. Include steps to reproduce and impact assessment.

## Secrets

Never commit:

- private keys, wallet seeds, Bearer tokens, or `.env` files
- real payment proofs or user PII in examples

Examples under `examples/` use fictional product names only.
