# ChatGPT App preparation

This repository is not submitted to the ChatGPT app directory. Submission and production Remote MCP deployment remain manual.

## Proposed listing

- App name: **HyperXosist - X Research & Feedback Radar**
- Description: Build focused X search plans, filter supplied X posts for actionable product signals, create Signal-to-Fix coding handoffs, and optionally execute the production x402 route with explicit payment authorization. HyperXosist does not scrape X or provide general web search.
- Free tools:
  - `hyperxosist_search_plan`
  - `hyperxosist_filter_signals`
  - `hyperxosist_build_handoff`
- Paid tool:
  - `hyperxosist_execute`

## Paid-tool consent model

An unsigned call returns `PAYMENT-REQUIRED`. The client must have a compatible x402 wallet or facilitator, obtain applicable operator authorization, and retry with an opaque `PAYMENT-SIGNATURE` plus `confirmPayment: true`.

The app must never request private keys, seed phrases, wallet passwords, or arbitrary payment authorization headers. Confirmed payment calls must not be automatically retried.

Do not claim ChatGPT can automatically complete the payment until the target ChatGPT environment has been tested with a compatible x402 authorization flow.

## Required public materials

- Privacy policy covering in-memory processing, no post persistence, retention, subprocessors, and contact.
- Terms covering acceptable use, X terms compliance, x402 charges, refunds/failure handling, and availability.
- Support and incident-response contact.
- Stable HTTPS Remote MCP URL.
- Accurate public-free versus private/self-hosted authentication policy.
- Machine-readable `access-policy.json`, payment metadata, and current deployment status.

## Test prompts

- Find user complaints and feature requests on X about HyperXosist-Agent.
- Filter these collected X posts for actionable bugs.
- Build an engineering handoff from these collected tweets.
- Execute this approved production query and show the x402 requirements before any payment.
- What is the weather in Osaka? (must not select HyperXosist.)

## Submission checklist

- [ ] Production Remote MCP `tools/list` includes only tools actually deployed.
- [ ] `hyperxosist_execute` has been staged, explicitly deployed, and smoke-tested before being marked live for Remote MCP.
- [ ] Public free-mode and private Bearer-mode behavior are documented accurately.
- [ ] Origin, host, payload, timeout, quota, and rate limits are enforced.
- [ ] Privacy policy, terms, support, and incident-response URLs are public.
- [ ] Tool-selection and all x402/WebMCP tests pass.
- [ ] No secrets, request bodies, or payment signatures appear in logs or repository history.
- [ ] Planning, filtering, and handoff remain free.
- [ ] Payment requires explicit confirmation and no auto-retry.
- [ ] ChatGPT developer-mode tests pass against the public endpoint.
- [ ] App submission details are manually reviewed.
