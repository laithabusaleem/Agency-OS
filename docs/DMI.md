# Decision-Maker Intelligence (DMI)

Evidence-backed identification of relevant decision-makers between Lead Hunter qualification and Business Auditor / outreach. Prefer accurate research and legitimate contact routes over lead volume.

## Workflow

1. Research company (existing acquisition)
2. Identify candidate decision-makers (`research_decision_maker` agent)
3. Verify role from source-backed evidence
4. Collect professional evidence (facts vs hypotheses)
5. Assess service fit
6. Discover contact channels with provenance labels
7. Draft personalized strategy (strategist)
8. Compliance / suppression / approval / quota gates
9. Send only when authorized (sending off by default)
10. Record relationship interactions; learn from outcomes

## Data model

| Table                        | Purpose                                              |
| ---------------------------- | ---------------------------------------------------- |
| `decision_maker_candidates`  | Role, confidence, service relevance, research status |
| `person_evidence`            | Claim + source URL + retrieval time + verification   |
| `contact_channels`           | Channel + provenance (never silent inferred→verified)|
| `outreach_strategy_drafts`   | Personalized messages + evidence explanation         |
| `relationship_interactions`  | Business-relevant history (no psych profiling)       |
| `dmi_research_runs`          | Idempotent research jobs                             |

## Modes

- **mock** — offline fixtures for configured demo domains (`acme`, `northstar`, `test`)
- **live** — Brave Search when `BRAVE_SEARCH_API_KEY` is set; **fail closed** otherwise (no fabricated people or emails)

## Privacy

Collect only business-relevant professional information. Sensitive personal patterns are rejected. No breached data, unauthorized access, or CAPTCHA bypass.

## UI

`/intelligence` — candidates, evidence (clickable sources), channels, strategies, relationship memory, approve/reject controls.

## Coordinator

`DecisionMakerCoordinator.scheduleAfterQualification` runs after acquisition qualifies a lead (best-effort). Caches fresh research (~7 days), supports agent jobs or inline runs, and reassigns when roles are unverified.

## Tests

`tests/dmi/acceptance.test.ts` covers org isolation, verification without evidence, inferred contacts, privacy, suppression, shared quota concurrency, reply/opt-out stop, provider fail-closed, unauthorized DM block, emergency stop, and restart persistence.
