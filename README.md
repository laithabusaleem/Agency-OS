# Agency OS (Phases 1–6 + DMI)

Production-minded Next.js App Router + TypeScript agency operations platform: CRM foundation, durable agent runtime, lead acquisition, decision-maker intelligence, gated outreach, service delivery, and release-hardening.

## Quick start

```bash
cp .env.example .env.local
# Set SESSION_SECRET to ≥32 characters
npm install
npm run db:setup
npm run dev
```

Second terminal:

```bash
npm run worker
```

Demo login: `demo@agency.local` / `DemoPass123!`

Full release docs: [docs/RELEASE.md](docs/RELEASE.md)

## Verify before release

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

Or: `npm run verify`

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS v4 + shadcn-style components
- Zod · Drizzle ORM · SQLite · iron-session
- Agent runtime (queue/worker) · acquisition · DMI · outreach · delivery
- Vitest · Prettier · Playwright (optional delivery QA)
- Pino logging with secret redaction

## Phase map

| Phase | Focus                    | Docs                                                                                                                                                                                                    |
| ----- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Foundation / CRUD / auth | README                                                                                                                                                                                                  |
| 2     | Agent runtime            | README                                                                                                                                                                                                  |
| 3     | Lead acquisition         | [LEAD_ACQUISITION.md](docs/LEAD_ACQUISITION.md)                                                                                                                                                         |
| DMI   | Decision-maker intel     | [DMI.md](docs/DMI.md)                                                                                                                                                                                   |
| 4     | Sales & outreach         | [OUTREACH.md](docs/OUTREACH.md)                                                                                                                                                                         |
| 5     | Service delivery         | [SERVICE_DELIVERY.md](docs/SERVICE_DELIVERY.md)                                                                                                                                                         |
| 6     | Release readiness        | [RELEASE.md](docs/RELEASE.md) · [THREAT_MODEL.md](docs/THREAT_MODEL.md) · [RUNBOOKS.md](docs/RUNBOOKS.md) · [KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md) · [DEPENDENCIES.md](docs/DEPENDENCIES.md) |

## Scripts

| Command                                       | Purpose                                        |
| --------------------------------------------- | ---------------------------------------------- |
| `npm run dev`                                 | Local web app                                  |
| `npm run worker`                              | Agent job worker                               |
| `npm run format` / `format:check`             | Prettier                                       |
| `npm run typecheck`                           | TypeScript                                     |
| `npm run lint`                                | ESLint                                         |
| `npm test`                                    | Unit + integration + E2E flow tests            |
| `npm run build`                               | Production build                               |
| `npm run db:migrate` / `db:seed` / `db:setup` | Database                                       |
| `npm run backup`                              | SQLite + workspaces backup                     |
| `npm run verify`                              | format:check → lint → typecheck → test → build |

## Safety defaults

- Outreach sending **off** until env + runtime enable + human approval
- Resend webhooks **fail closed** without signature secret
- Unsubscribe links are **HMAC-signed**
- Public fetch blocks private/metadata targets (SSRF)
- Delivery never executes model-generated code on the host
- Privileged delivery actions need explicit admin authorization

---

<p align="center">
  <strong>Built by Laith Abu-Saleem</strong><br/>
  <a href="https://github.com/laithabusaleem">github.com/laithabusaleem</a>
</p>
