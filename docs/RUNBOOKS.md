# Operational runbooks

## Emergency stop (outreach)

1. Set `OUTREACH_EMERGENCY_STOP=true` in env **or** toggle Emergency stop on `/outreach` (admin)
2. Confirm sends fail with `emergency_stop`
3. Investigate bounce/complaint/abuse
4. Clear stop only after review; keep `OUTREACH_SENDING_ENABLED=false` until ready

## Agent kill switch

1. Toggle kill switch on `/agents` or set `AGENT_KILL_SWITCH=true`
2. Worker stops claiming jobs; enqueue still allowed for inspection
3. Cancel stuck jobs from the Agents UI
4. Re-enable after provider outage / budget review

## Suppress a recipient

1. `/outreach` → Suppression list → add email, **or**
2. Recipient uses signed unsubscribe link, **or**
3. Signed Resend webhook bounce/complaint

Suppression is persistent per org email and blocks future sends.

## Rotate secrets

1. Generate new `SESSION_SECRET` (≥32 chars) — **logs out all users**
2. Rotate provider API keys in env; restart web + worker
3. Rotate `RESEND_WEBHOOK_SECRET` in Resend dashboard and env together
4. If using `CREDENTIALS_ENCRYPTION_KEY`, rotating it invalidates sealed secrets

## Backup

```bash
npx tsx --env-file=.env.local scripts/backup.ts
```

Copies SQLite (+ WAL/SHM if present) and `data/workspaces` into `data/backups/agency-backup-<timestamp>/`.

## Restore

1. Stop `next` and `npm run worker`
2. Replace `DATABASE_PATH` file with backup `agency.sqlite` (and `-wal`/`-shm` if present)
3. Restore `workspaces/` next to configured `DELIVERY_WORKSPACE_ROOT`
4. `npm run db:migrate` (no-ops if already current)
5. Start web + worker; verify `/api/health`

## Database migrations

```bash
npm run db:migrate
```

SQL lives in `src/db/migrations/`. Generate after schema edits:

```bash
npm run db:generate
npm run db:migrate
```

Never edit applied migrations in production; add a new numbered migration instead.

## Suspected webhook abuse

1. Ensure `RESEND_WEBHOOK_SECRET` is set (webhooks return 503 if missing)
2. Rotate webhook secret
3. Review `outreach_events` / suppression list for unexpected stops

## Delivery privileged action misuse

1. Keep `DELIVERY_*_ENABLED=false` unless needed
2. Revoke pending authorizations; require fresh admin approval
3. Inspect `delivery_authorizations` and workflow status
