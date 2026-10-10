# Threat model (Phase 6)

## System overview

Agency OS is a single-process (web + optional worker) operations platform using SQLite, iron-session cookies, and env-based integration secrets. Default posture: **single-tenant / single-organization deployment**.

## Assets

| Asset                         | Location                                          | Sensitivity |
| ----------------------------- | ------------------------------------------------- | ----------- |
| Session cookies               | Browser / iron-session                            | High        |
| `SESSION_SECRET`              | Env                                               | Critical    |
| LLM / Brave / Resend API keys | Env                                               | High        |
| Lead/contact PII              | SQLite                                            | High        |
| Outreach suppression list     | SQLite                                            | Medium      |
| Delivery artifacts            | `data/workspaces`                                 | Medium      |
| Encrypted credential helper   | Optional DB seal via `CREDENTIALS_ENCRYPTION_KEY` | High        |

## Trust boundaries

1. **Browser → Next.js** — session cookie; Server Actions use framework Origin checks
2. **Public routes** — `/login`, `/api/health`, signed unsubscribe, signed Resend webhooks
3. **Worker process** — same DB file; kill switch / budgets apply process-wide
4. **Outbound network** — public fetch (SSRF-filtered), Brave, Resend, LLM providers

## Adversaries & mitigations

| Threat                     | Mitigation                                                                      |
| -------------------------- | ------------------------------------------------------------------------------- |
| Session theft              | httpOnly cookies; `secure` in production; min 32-char secret; proxy fail-closed |
| Open redirect              | Login `next` param must be relative path                                        |
| CSRF on Server Actions     | Next.js Origin↔Host checks; session `SameSite=lax`                              |
| CSRF on CSV export         | Same-origin / Sec-Fetch-Site checks; prefer POST                                |
| Forged unsubscribe         | HMAC token (`token=`), not raw org+email                                        |
| Forged Resend webhooks     | `RESEND_WEBHOOK_SECRET` required; Svix-style signature verify                   |
| SSRF via research fetch    | Protocol/host/IP blocklist; no auto-redirect without re-check                   |
| Path traversal in delivery | Workspace jail; reject `..`                                                     |
| Prompt injection           | Sanitize retrieved text; treat as untrusted data                                |
| Unauthorized send/deploy   | Dual switches + admin approval + gates; agents cannot self-approve              |
| Quota races                | Conditional daily quota reservation before provider call                        |
| Secret leakage in logs     | Pino redaction of API keys / auth headers / session                             |
| Model code execution       | Permanently blocked in delivery tools/settings                                  |

## Accepted risks / known limitations

- Runtime settings (agent/outreach/delivery) are **process-global**, not per-org — unsuitable for hostile multi-tenant SaaS without further work
- Integration secrets default to **env vars**, not a per-org KMS vault (optional `sealSecret` helper exists)
- SQLite file is not encrypted at rest — protect disk / backups
- Prompt-injection filters are heuristic
- Public `/api/health` exposes kill-switch boolean (not budgets)

See [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md).
