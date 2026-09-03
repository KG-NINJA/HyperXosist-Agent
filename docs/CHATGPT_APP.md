# ChatGPT App preparation

This repository is not submitted to the ChatGPT app directory. This checklist prepares a future submission after a public HTTPS Remote MCP endpoint exists.

## Proposed listing

- App name: **HyperXosist - X Research & Feedback Radar**
- Description: Build focused X search plans, filter previously collected X posts for actionable product signals, and create Signal-to-Fix coding handoffs. HyperXosist does not scrape X or provide general web search.
- Tools:
  - `hyperxosist_search_plan`: create official x.com/search URLs and quality scores.
  - `hyperxosist_filter_signals`: classify already collected X post text.
  - `hyperxosist_build_handoff`: create a structured engineering handoff.

## Required public materials

- Privacy policy explaining in-memory processing, no post persistence, retention, subprocessors, and contact.
- Terms covering acceptable use, X terms compliance, x402 execution charges, and availability.
- Support contact and incident-response route.
- Stable HTTPS Remote MCP URL ending in `/mcp`.
- Authentication and account-linking policy appropriate for public users.

## Test prompts

- Find user complaints and feature requests on X about HyperXosist-Agent.
- Filter these collected X posts for actionable bugs.
- Build an engineering handoff from these collected tweets.
- What is the weather in Osaka? (must not select HyperXosist)

## Submission checklist

- [ ] Remote MCP is deployed behind HTTPS.
- [ ] Bearer/OAuth authentication is production-ready.
- [ ] Origin, host, payload, timeout, and rate limits are enforced.
- [ ] Privacy policy, terms, and support URLs are public.
- [ ] The 20-case tool-selection evaluation passes.
- [ ] No secrets appear in logs, examples, image layers, or repository history.
- [ ] x402 applies only to automated production execution, not planning.
- [ ] Monitoring and incident response are configured.
- [ ] ChatGPT developer-mode tests pass against the public endpoint.
- [ ] App submission details are reviewed manually before submission.


## Paid execution

Discovery, planning, filtering, and handoff remain free. `hyperxosist_execute` is the only paid production tool. It delegates verification and settlement to the existing x402 v2 endpoint. An unsigned call returns `PAYMENT-REQUIRED`; a confirmed retry supplies `PAYMENT-SIGNATURE`. Clients must never provide private keys or seed phrases.
