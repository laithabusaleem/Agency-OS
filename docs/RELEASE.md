# Release readiness (Phase 6)

## Local setup (exact commands)

```bash
# 1. Install
npm install

# 2. Environment
cp .env.example .env.local
# Edit .env.local — required:
#   SESSION_SECRET=<at least 32 characters>
# Optional: BRAVE_SEARCH_API_KEY, RESEND_*, LLM keys, DELIVERY_PLAYWRIGHT_ENABLED

# 3. Database
npm run db:setup

# 4. App
npm run dev

# 5. Agent worker (second terminal)
npm run worker
```

Demo login after seed:

- Email: `demo@agency.local`
- Password: `DemoPass123!`

## Verification suite (must actually pass)

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

Optional browser binaries for delivery Playwright QA:

```bash
npm run playwright:install
```

## Optional hosted deployment

1. Provision a Node 20+ host (or container) with persistent disk for `DATABASE_PATH` and `DELIVERY_WORKSPACE_ROOT`
2. Set production env from `.env.example` (`NODE_ENV=production`, strong `SESSION_SECRET`, provider keys)
3. `npm ci && npm run db:migrate && npm run build`
4. Run `npm run start` behind HTTPS reverse proxy
5. Run `npm run worker` as a supervised second process
6. Configure Resend webhook → `https://<host>/api/outreach/webhooks/resend` with `RESEND_WEBHOOK_SECRET`
7. Set `serverActions.allowedOrigins` in `next.config.ts` if using a custom domain/proxy
8. Schedule `npx tsx --env-file=.env.local scripts/backup.ts` (or equivalent) daily

**Do not** run multiple app instances against one SQLite file.

## Documents

| Doc                                            | Purpose                                    |
| ---------------------------------------------- | ------------------------------------------ |
| [THREAT_MODEL.md](./THREAT_MODEL.md)           | Assets, adversaries, mitigations           |
| [RUNBOOKS.md](./RUNBOOKS.md)                   | Emergency stop, backup/restore, migrations |
| [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md) | Explicit non-goals / gaps                  |
| [DEPENDENCIES.md](./DEPENDENCIES.md)           | Dependency inventory                       |
| [LEAD_ACQUISITION.md](./LEAD_ACQUISITION.md)   | Phase 3                                    |
| [OUTREACH.md](./OUTREACH.md)                   | Phase 4                                    |
| [SERVICE_DELIVERY.md](./SERVICE_DELIVERY.md)   | Phase 5                                    |

## Security hardening shipped in Phase 6

- Proxy fails closed without `SESSION_SECRET`
- Signed unsubscribe tokens
- Resend webhooks require verified signatures
- SSRF blocks for private/metadata targets + safe redirects
- Admin-only message approve/send
- Org checks on delivery authorization approve
- Broader log redaction
- Same-origin checks on lead CSV export
- Atomic-ish daily quota reservation before send
- Optional credentials seal helper
- Backup script + ops docs
