# Service delivery (Phase 5)

Reusable workflow templates produce **real artifacts** in isolated project workspaces. A delivery agent executes allowlisted tools; an **independent QA agent** verifies requirements, files, links, and tests — never trusting model claims.

## Setup

1. `npm run db:migrate` (applies `0004_service_delivery`)
2. Optional: `npx playwright install chromium` and set `DELIVERY_PLAYWRIGHT_ENABLED=true` for real browser smoke tests
3. Optional for live research: `BRAVE_SEARCH_API_KEY`
4. `npm run dev` → `/delivery`

### Key env vars

| Variable                              | Default             | Purpose                                      |
| ------------------------------------- | ------------------- | -------------------------------------------- |
| `DELIVERY_RUNS_ENABLED`               | `true`              | Allow delivery/QA runs                       |
| `DELIVERY_DEPLOY_ENABLED`             | `false`             | Capability switch for deploy                 |
| `DELIVERY_PUBLICATION_ENABLED`        | `false`             | External publication                         |
| `DELIVERY_SPENDING_ENABLED`           | `false`             | Spending actions                             |
| `DELIVERY_DESTRUCTIVE_ENABLED`        | `false`             | Destructive actions                          |
| `DELIVERY_ALLOW_MODEL_CODE_EXECUTION` | `false`             | **Must stay false** — host blocks model code |
| `DELIVERY_WORKSPACE_ROOT`             | `./data/workspaces` | Isolated workspace root                      |
| `DELIVERY_PLAYWRIGHT_ENABLED`         | `false`             | Use Playwright when browsers installed       |
| `BRAVE_SEARCH_API_KEY`                | _(empty)_           | Live `business_research` mode                |

Privileged actions also need an **explicit approved authorization** row (admin). Env/runtime capability alone is not enough.

## Templates

| Id                  | Purpose                                          |
| ------------------- | ------------------------------------------------ |
| `website_project`   | Static site + CSS + manifest; Playwright/link QA |
| `marketing_content` | Campaign brief + channel copy                    |
| `business_research` | Memo + citations (fixture or Brave live)         |
| `ai_automation`     | Runbook + test plan (no host code execution)     |

Each template defines intake questions, scope, allowed tools, dependencies, acceptance criteria, outputs, and failure conditions.

## Agents

- **Delivery agent** (`src/delivery/agents/delivery.ts`) — runs template steps via allowlisted tools only
- **QA agent** (`src/delivery/agents/qa.ts`) — re-checks brief, artifact existence, checksums, content, links, Playwright/static browser smoke, static suites

## Safety

- Workspaces are path-jailed under `DELIVERY_WORKSPACE_ROOT/{org}/{project}/{workflow}`
- Tools refuse `executeCode` / `eval` / `shell` parameters
- `allowModelCodeExecution` cannot enable host execution of model code
- Deploy / publication / spending / destructive require dual switches + human approval

## Modes

- **mock** — fixtures under `src/delivery/fixtures` (offline, tests)
- **live** — e.g. Brave-backed research when credentials are configured; fails closed otherwise

## Tests

```bash
npm test -- tests/delivery
```

Coverage: incomplete briefs, invalid/corrupted artifacts, failed tools, revisions/recovery, privileged auth, mock templates, live research with mocked credentials.
