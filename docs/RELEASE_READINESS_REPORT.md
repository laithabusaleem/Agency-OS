# Release readiness report

**Date:** 2026-10-10  
**Scope:** Agency OS Phases 1–6

## Verdict

**Conditionally ready for single-tenant / trusted internal deployment** with outreach sending left disabled until operators complete the approval checklist.

**Not ready** for hostile multi-tenant SaaS (global runtime settings; SQLite single-writer) without further work — see [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md).

## Defects fixed in Phase 6

| Severity | Fix                                                       |
| -------- | --------------------------------------------------------- |
| Critical | Proxy fails closed without `SESSION_SECRET`               |
| Critical | HMAC-signed unsubscribe tokens                            |
| Critical | Resend webhooks require signature + secret (fail-closed)  |
| Critical | SSRF blocks private/metadata IPs; safe redirect hops      |
| High     | Admin-only message approve/send                           |
| High     | Org checks on delivery authorization create/approve       |
| High     | Lead CSV export same-origin checks                        |
| High     | Broader Pino secret redaction                             |
| High     | Daily quota reservation before provider send              |
| Medium   | Optional credentials seal helper; backup script; ops docs |

## Checks run (this release pass)

| Check                    | Command                             | Result     |
| ------------------------ | ----------------------------------- | ---------- |
| Format                   | `npm run format:check`              | **PASSED** |
| Lint                     | `npm run lint`                      | **PASSED** |
| Typecheck                | `npm run typecheck`                 | **PASSED** |
| Unit / integration / E2E | `npm test` (20 files, **73** tests) | **PASSED** |
| Production build         | `npm run build`                     | **PASSED** |
| Backup script            | `npm run backup`                    | **PASSED** |

## Exact setup commands

```bash
cp .env.example .env.local
# Set SESSION_SECRET (≥32 chars). Optional: provider keys, RESEND_WEBHOOK_SECRET
npm install
npm run db:setup
npm run verify
npm run dev
# other terminal:
npm run worker
```

Demo: `demo@agency.local` / `DemoPass123!`

## Operator docs

- [RELEASE.md](./RELEASE.md) — setup + hosted deploy
- [THREAT_MODEL.md](./THREAT_MODEL.md)
- [RUNBOOKS.md](./RUNBOOKS.md) — kill switches, backup/restore, migrations
- [DEPENDENCIES.md](./DEPENDENCIES.md)
- [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md)
