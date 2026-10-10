# Known limitations

## Multi-tenancy

- Agent, outreach, and delivery **runtime settings are global** (one row per process DB), not per organization. Deploy one database per customer for isolation of kill switches / send toggles.
- Suitable for single-tenant or trusted multi-org demos; **not** ready for hostile multi-tenant SaaS without schema changes.

## Integrations

- Stripe, Slack, and Google Calendar are **status/env stubs** only — no live API clients yet.
- Resend is implemented for permitted categories; reply detection requires inbound/webhook setup.
- Credentials default to environment variables. Optional AES-GCM helper (`src/lib/security/credentials.ts`) exists but is not wired to a full secrets UI/vault.

## Outreach

- Sending remains **disabled by default** until env + runtime toggles and human approvals.
- Playwright browser QA for websites requires `npx playwright install chromium` and `DELIVERY_PLAYWRIGHT_ENABLED=true`; otherwise static HTML checks are used.
- Daily quota reservation is optimistic under SQLite; extremely high concurrency may still need DB-level constraints when moving to Postgres.

## Acquisition

- Prompt-injection sanitization is pattern-based defense-in-depth, not a guarantee.
- Brave Search results are third-party snippets — verify before outreach.
- Public fetch will not bypass CAPTCHAs, logins, or robots.txt.

## Delivery

- Delivery tools never execute model-generated code; automation templates produce docs/runbooks only.
- Live `business_research` fails closed without `BRAVE_SEARCH_API_KEY`.

## Platform

- SQLite is file-backed; concurrent writers across multiple hosts are unsupported.
- No built-in login rate limiting / account lockout yet.
- Session idle timeout is cookie-lifetime / browser session based (iron-session defaults).
