# Sales & outreach (Phase 4)

Evidence-backed audits, personalized drafts, proposals, follow-up scheduling, a human review queue, explicit campaign approval, and a pluggable email sender. **Sending is disabled by default.**

## Setup

1. Copy `.env.example` → `.env.local`
2. `npm run db:migrate` (applies `0003_outreach`)
3. Optionally configure Resend (below)
4. `npm run dev` → open `/outreach`

### Key env vars

| Variable                         | Default                        | Purpose                                                      |
| -------------------------------- | ------------------------------ | ------------------------------------------------------------ |
| `OUTREACH_SENDING_ENABLED`       | `false`                        | Hard ops master switch. Must be `true` before any live send. |
| `OUTREACH_EMERGENCY_STOP`        | `false`                        | Immediate halt of all sends when `true`                      |
| `OUTREACH_DAILY_QUOTA`           | `50`                           | Global transactional/outreach daily cap per org              |
| `OUTREACH_PER_CAMPAIGN_LIMIT`    | `100`                          | Default campaign ceiling (overridable per campaign)          |
| `OUTREACH_RATE_LIMIT_PER_MINUTE` | `10`                           | Soft rate limit                                              |
| `OUTREACH_FROM_EMAIL`            | _(empty)_                      | Verified sender identity                                     |
| `OUTREACH_FROM_NAME`             | `Agency OS`                    | Display name                                                 |
| `RESEND_API_KEY`                 | _(empty)_                      | Resend API credential                                        |
| `RESEND_WEBHOOK_SECRET`          | _(empty)_                      | Optional webhook verification secret                         |
| `OUTREACH_UNSUBSCRIBE_BASE_URL`  | local unsubscribe URL          | Link embedded in outbound mail                               |
| `OUTREACH_UNSUBSCRIBE_SECRET`    | falls back to `SESSION_SECRET` | HMAC secret for unsubscribe tokens                           |
| `RESEND_WEBHOOK_SECRET`          | _(empty)_                      | **Required** for webhook mutations (fail-closed)             |

Runtime admin controls on `/outreach` also toggle **Sending** and **Emergency stop** in `outreach_settings`. Both the env master switch **and** the runtime toggle must be on; emergency stop in either place blocks sends.

## Workflow (required before any send)

1. Create an **evidence-backed business audit** (findings tagged `fact` / `inference` / `unknown`)
2. Create a **campaign** (`approvalRequired=true` by default)
3. Draft a **personalized message / proposal / follow-up** against a lead with `emailProvenance=observed`
4. Submit campaign + message to the **review queue** (`/outreach/review`)
5. Admin **explicitly approves** the campaign and message
6. Ops sets `OUTREACH_SENDING_ENABLED=true`, configures sender, enables runtime sending
7. Send with an **idempotency key** — never because an agent asked alone

Agents cannot bypass server gates. `enqueueAndSend` re-checks eligibility after a conditional claim.

## Server send gates

Every send path enforces:

- Master switch + runtime sending enabled
- Emergency stop off
- Message status `approved` or `scheduled`
- Campaign approved (approved_outreach) with sendable status and under campaign limit
- Recipient eligibility (valid email; lead email must be observed and match)
- Persistent **suppression list**
- Daily quota + per-minute rate limit
- Sender configured and category permitted by provider policy
- Unique `(organizationId, idempotencyKey)` — duplicate retries replay, no second provider call

## Stop conditions

Automated follow-ups and pending drafts are cancelled when:

- Recipient unsubscribes (`/api/outreach/unsubscribe`)
- Bounce / complaint webhooks fire
- Reply detected (when the provider supports it)
- Campaign stopped or emergency stop engaged

## Resend adapter — permitted categories & limitations

Adapter: `src/outreach/senders/resend.ts`

**Permitted categories only:** `transactional`, `approved_outreach` (`RESEND_PERMITTED_CATEGORIES`).

### Limitations

- Requires a **verified domain / from address** in Resend
- Does **not** bypass campaign approval or server gates
- **Reply detection** is best-effort via Resend webhooks / inbound routing (`email.received` / `email.replied`); not guaranteed without inbound setup
- Resend is not a bulk cold-email ESP — respect [Resend Acceptable Use](https://resend.com/legal/acceptable-use) and local quotas
- Marketing / unsolicited cold email may be restricted by provider policy; operators remain responsible for lawful consent and compliance
- Webhook signature verification via `RESEND_WEBHOOK_SECRET` should be enforced in production deployments

### Webhooks

`POST /api/outreach/webhooks/resend` maps bounce / complaint / reply events to stop conditions when the provider message id matches an `outreach_sends` row.

Requests without a valid Svix/Resend signature are rejected (`401`). If `RESEND_WEBHOOK_SECRET` is unset, the endpoint returns `503`.

Unsubscribe links use HMAC `token=` query params (not raw `org` + `email`).

## Pluggable senders

| Sender     | When active                                                                           |
| ---------- | ------------------------------------------------------------------------------------- |
| `disabled` | Default — always when master switch off, emergency stop on, or no provider configured |
| `resend`   | Env enabled + API key + from email                                                    |
| `mock`     | Tests only via `setTestEmailSender` — **never** a silent production fallback          |

## Tests

```bash
npm test -- tests/outreach
```

Coverage includes concurrent claim races, duplicate idempotency retries, suppression, missing approval, quota exhaustion, and emergency stop.
