# Lead acquisition (Phase 3)

## Setup

1. Copy `.env.example` → `.env.local`
2. Optional search providers:
   - `OPENROUTER_API_KEY` — AI web search (recommended if you cannot get Brave)
   - `BRAVE_SEARCH_API_KEY` — [Brave Search API](https://brave.com/search/api/)
3. `npm run db:migrate`
4. `npm run dev`

Without a search key, **manual entry** and **CSV import/export** remain fully usable. Research runs fail closed with a clear error (no invented prospects). AI search only accepts cited `https` URLs from OpenRouter web search — it does not invent companies or emails.

### Key env vars

| Variable                          | Purpose                                       |
| --------------------------------- | --------------------------------------------- |
| `OPENROUTER_API_KEY`              | AI web search for lead research               |
| `BRAVE_SEARCH_API_KEY`            | Brave Web Search authentication               |
| `ACQUISITION_DEFAULT_PROVIDER`    | `openrouter`, `brave`, `manual`, `csv`, `mock`|
| `ACQUISITION_ALLOW_MOCK`          | Explicit mock research provider for tests/dev |
| `ACQUISITION_EVIDENCE_TTL_HOURS`  | Evidence staleness window (default 168h)      |
| `ACQUISITION_MAX_FETCHES_PER_RUN` | Cap on public page fetches per run            |

## Workflows

1. **Manual** — `/leads` create form; blank email allowed (`emailProvenance=unknown`)
2. **CSV import** — paste CSV; domain-normalized dedupe
3. **CSV export** — `/api/leads/export` (authenticated, respects filters)
4. **Research** — Brave Search hits → domain dedupe → optional public fetch

## Evidence model

Each claim is stored as:

- `fact` — observed on a public source or provided by a human/CSV
- `inference` — derived (e.g. title → company name); editable
- `unknown` — explicitly not known (especially contacts)

Retrieval timestamps and optional `staleAfterAt` track freshness. Scores keep factor-level rationales and evidence IDs.

## Compliance / source limitations

- Respects `robots.txt` and crawl-delay
- Rate-limits per host
- Does **not** bypass CAPTCHAs, logins, 401/403 blocks, or paywalls
- Does **not** invent email/phone numbers
- Sanitizes prompt-injection patterns in retrieved text before storage
- Brave results are third-party snippets — verify before outreach
- Public website content may be incomplete, outdated, or non-commercial-use restricted by site terms; operators remain responsible for lawful use

## Filters

Leads list supports `market`, `niche`, `status`, `minScore`, `minServiceFit`, and free-text `q`.
