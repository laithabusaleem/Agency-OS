import { and, desc, eq } from "drizzle-orm";
import {
  assertChannelLabeling,
  rankChannels,
  type DiscoveredChannel,
} from "@/dmi/channels";
import { fixtureForDomain } from "@/dmi/fixtures";
import { assertBusinessRelevantClaim, sanitizeProfessionalText } from "@/dmi/privacy";
import {
  canMarkRoleVerified,
  scoreRoleConfidence,
  scoreServiceRelevance,
} from "@/dmi/scoring";
import {
  SERVICE_ROLE_PREFERENCE,
  type ServiceKind,
} from "@/dmi/types";
import type { AppDatabase } from "@/db/factory";
import {
  contactChannels,
  decisionMakerCandidates,
  dmiResearchRuns,
  leads,
  personEvidence,
  relationshipInteractions,
} from "@/db/schema";
import { createId } from "@/lib/id";

function nowIso() {
  return new Date().toISOString();
}

function staleAfter(hours = 168) {
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

export function resolveServiceKind(service?: string | null): ServiceKind {
  const s = (service || "").toLowerCase();
  if (/web|site|landing/.test(s)) return "website";
  if (/market|content|brand/.test(s)) return "marketing";
  if (/automat|ops|workflow/.test(s)) return "automation";
  if (/research|audit/.test(s)) return "research";
  return "general";
}

/**
 * Decision-maker research — mock fixtures or live search when configured.
 * Never invents people or contact details. Provider failure → explicit failure.
 */
export async function runDecisionMakerResearch(input: {
  db: AppDatabase;
  organizationId: string;
  leadId: string;
  targetService: string;
  mode: "mock" | "live";
  idempotencyKey: string;
  userId?: string | null;
  force?: boolean;
}) {
  const { db } = input;

  const existingRun = await db.query.dmiResearchRuns.findFirst({
    where: and(
      eq(dmiResearchRuns.organizationId, input.organizationId),
      eq(dmiResearchRuns.idempotencyKey, input.idempotencyKey),
    ),
  });
  if (existingRun?.status === "succeeded" && !input.force) {
    return { run: existingRun, replay: true as const };
  }

  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, input.leadId),
  });
  if (!lead || lead.organizationId !== input.organizationId) {
    throw new Error("Lead not found in organization");
  }

  // Freshness cache: skip re-research if recent verified candidates exist
  if (!input.force) {
    const recent = await db.query.decisionMakerCandidates.findMany({
      where: and(
        eq(decisionMakerCandidates.leadId, lead.id),
        eq(decisionMakerCandidates.organizationId, input.organizationId),
      ),
      orderBy: [desc(decisionMakerCandidates.updatedAt)],
      limit: 5,
    });
    const fresh = recent.find((c) => {
      if (!c.lastVerifiedAt) return false;
      const age = Date.now() - Date.parse(c.lastVerifiedAt);
      return age < 1000 * 60 * 60 * 24 * 7;
    });
    if (fresh && recent.length) {
      const runId = existingRun?.id ?? createId("dmirun");
      const stamp = nowIso();
      if (!existingRun) {
        await db.insert(dmiResearchRuns).values({
          id: runId,
          organizationId: input.organizationId,
          leadId: lead.id,
          status: "succeeded",
          mode: input.mode,
          targetService: input.targetService,
          resultJson: JSON.stringify({ cached: true, candidateIds: recent.map((c) => c.id) }),
          idempotencyKey: input.idempotencyKey,
          createdAt: stamp,
          updatedAt: stamp,
        });
      }
      return {
        run: (await db.query.dmiResearchRuns.findFirst({
          where: eq(dmiResearchRuns.id, runId),
        }))!,
        replay: false as const,
        cached: true as const,
        candidateIds: recent.map((c) => c.id),
      };
    }
  }

  const runId = existingRun?.id ?? createId("dmirun");
  const stamp = nowIso();
  if (!existingRun) {
    await db.insert(dmiResearchRuns).values({
      id: runId,
      organizationId: input.organizationId,
      leadId: lead.id,
      status: "running",
      mode: input.mode,
      targetService: input.targetService,
      idempotencyKey: input.idempotencyKey,
      createdAt: stamp,
      updatedAt: stamp,
    });
  } else {
    await db
      .update(dmiResearchRuns)
      .set({ status: "running", updatedAt: stamp, errorMessage: null })
      .where(eq(dmiResearchRuns.id, runId));
  }

  try {
    const serviceKind = resolveServiceKind(input.targetService);
    const preferred = SERVICE_ROLE_PREFERENCE[serviceKind];

    let pack = fixtureForDomain(lead.domain);
    if (input.mode === "live") {
      const key = process.env.BRAVE_SEARCH_API_KEY;
      if (!key) {
        throw new Error(
          "Live decision-maker research requires BRAVE_SEARCH_API_KEY (fail closed — no fabricated research)",
        );
      }
      // Live mode still uses structured extraction from search snippets when available;
      // if Brave returns nothing useful, we record limitation rather than invent.
      const live = await fetchBravePeopleHints({
        apiKey: key,
        company: lead.company || lead.domain || lead.name,
        domain: lead.domain,
      });
      if (live.candidates.length) {
        pack = { candidates: live.candidates };
      } else {
        pack = {
          candidates: [],
          limitation:
            live.limitation ||
            "Live search returned no usable decision-maker evidence",
        };
      }
    }

    if (!pack.candidates.length) {
      await db.insert(relationshipInteractions).values({
        id: createId("rint"),
        organizationId: input.organizationId,
        leadId: lead.id,
        type: "research_completed",
        summary:
          pack.limitation ||
          "Decision-maker not identified; continue with company-level contact routes",
        payloadJson: JSON.stringify({ limitation: pack.limitation, mode: input.mode }),
        createdByUserId: input.userId ?? null,
        createdAt: nowIso(),
      });
      await db
        .update(dmiResearchRuns)
        .set({
          status: "succeeded",
          resultJson: JSON.stringify({
            candidateIds: [],
            limitation: pack.limitation,
          }),
          updatedAt: nowIso(),
        })
        .where(eq(dmiResearchRuns.id, runId));
      return {
        run: (await db.query.dmiResearchRuns.findFirst({
          where: eq(dmiResearchRuns.id, runId),
        }))!,
        replay: false as const,
        candidateIds: [] as string[],
        limitation: pack.limitation,
      };
    }

    const candidateIds: string[] = [];
    for (const c of pack.candidates) {
      assertBusinessRelevantClaim(c.summary);
      const candidateId = createId("dmcand");
      const evidenceRows = [];
      for (const ev of c.evidence) {
        assertBusinessRelevantClaim(ev.claim);
        if (!ev.sourceUrl) {
          throw new Error("Missing sources produce uncertainty — source URL required");
        }
        evidenceRows.push({
          id: createId("pev"),
          organizationId: input.organizationId,
          candidateId,
          sourceUrl: ev.sourceUrl,
          sourceType: ev.sourceType,
          claim: sanitizeProfessionalText(ev.claim),
          supportingExcerpt: sanitizeProfessionalText(ev.excerpt),
          kind: ev.kind,
          confidence: ev.kind === "fact" ? 70 : 40,
          verificationStatus:
            ev.kind === "fact" ? ("verified" as const) : ("unverified" as const),
          retrievedAt: nowIso(),
          staleAfterAt: staleAfter(),
          isStale: false,
          createdAt: nowIso(),
        });
      }

      const roleConfidence = scoreRoleConfidence(
        evidenceRows.map((e) => ({
          ...e,
          publicationDate: null,
        })) as never,
      );
      const verified = canMarkRoleVerified(evidenceRows as never);
      const serviceRelevance = scoreServiceRelevance({
        decisionMakerType: c.decisionMakerType,
        preferred,
        hasOpportunityEvidence: c.opportunities.length > 0,
      });

      await db.insert(decisionMakerCandidates).values({
        id: candidateId,
        organizationId: input.organizationId,
        leadId: lead.id,
        fullName: c.fullName,
        currentRole: c.currentRole,
        decisionMakerType: c.decisionMakerType,
        roleConfidence,
        serviceRelevanceScore: serviceRelevance,
        professionalSummary: sanitizeProfessionalText(c.summary),
        verifiedPrioritiesJson: JSON.stringify(c.priorities),
        potentialOpportunitiesJson: JSON.stringify(c.opportunities),
        researchStatus: verified ? "verified" : "needs_review",
        selectedForOutreach: false,
        lastVerifiedAt: verified ? nowIso() : null,
        uncertaintyNotes: verified
          ? null
          : "Role lacks sufficient verified first-party evidence",
        targetService: input.targetService,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });

      for (const row of evidenceRows) {
        await db.insert(personEvidence).values(row);
      }

      const channels: DiscoveredChannel[] = c.channels.map((ch) => ({
        ...ch,
        notes: undefined,
      }));
      for (const ch of rankChannels(channels)) {
        assertChannelLabeling(ch);
        await db.insert(contactChannels).values({
          id: createId("dchan"),
          organizationId: input.organizationId,
          candidateId,
          channelType: ch.channelType,
          value: ch.value,
          provenance: ch.provenance,
          sourceUrl: ch.sourceUrl ?? null,
          discoveryMethod: ch.discoveryMethod,
          allowedForAutomation: ch.allowedForAutomation,
          notes: ch.notes ?? null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      }

      await db.insert(relationshipInteractions).values({
        id: createId("rint"),
        organizationId: input.organizationId,
        leadId: lead.id,
        candidateId,
        type: "research_completed",
        summary: `Researched ${c.fullName} (${c.currentRole}) — confidence ${roleConfidence}`,
        payloadJson: JSON.stringify({
          roleConfidence,
          serviceRelevance,
          verified,
        }),
        createdByUserId: input.userId ?? null,
        createdAt: nowIso(),
      });

      candidateIds.push(candidateId);
    }

    // Select best candidate for service without auto-sending
    const all = await db.query.decisionMakerCandidates.findMany({
      where: eq(decisionMakerCandidates.leadId, lead.id),
    });
    const best = [...all].sort(
      (a, b) =>
        b.serviceRelevanceScore +
        b.roleConfidence -
        (a.serviceRelevanceScore + a.roleConfidence),
    )[0];
    if (best) {
      await db
        .update(decisionMakerCandidates)
        .set({ selectedForOutreach: false, updatedAt: nowIso() })
        .where(eq(decisionMakerCandidates.leadId, lead.id));
      await db
        .update(decisionMakerCandidates)
        .set({ selectedForOutreach: true, updatedAt: nowIso() })
        .where(eq(decisionMakerCandidates.id, best.id));
    }

    await db
      .update(dmiResearchRuns)
      .set({
        status: "succeeded",
        resultJson: JSON.stringify({ candidateIds, selectedId: best?.id }),
        updatedAt: nowIso(),
      })
      .where(eq(dmiResearchRuns.id, runId));

    return {
      run: (await db.query.dmiResearchRuns.findFirst({
        where: eq(dmiResearchRuns.id, runId),
      }))!,
      replay: false as const,
      candidateIds,
      selectedId: best?.id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(dmiResearchRuns)
      .set({
        status: "failed",
        errorMessage: message,
        updatedAt: nowIso(),
      })
      .where(eq(dmiResearchRuns.id, runId));
    throw error;
  }
}

async function fetchBravePeopleHints(input: {
  apiKey: string;
  company: string;
  domain: string | null;
}): Promise<{
  candidates: ReturnType<typeof fixtureForDomain>["candidates"];
  limitation?: string;
}> {
  try {
    const q = `${input.company} founder OR CEO OR "head of marketing" site:${input.domain || ""}`;
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", q.trim());
    url.searchParams.set("count", "5");
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": input.apiKey,
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return {
        candidates: [],
        limitation: `Brave search failed (HTTP ${res.status}) — no fabricated research`,
      };
    }
    const payload = (await res.json()) as {
      web?: {
        results?: Array<{ title?: string; url?: string; description?: string }>;
      };
    };
    const results = payload.web?.results ?? [];
    if (!results.length) {
      return {
        candidates: [],
        limitation: "No public search hits for decision-makers",
      };
    }

    // Only create a hypothesis candidate if titles clearly suggest a named role —
    // never mark verified without first-party confirmation.
    const hit = results.find((r) =>
      /founder|ceo|director|marketing/i.test(`${r.title} ${r.description}`),
    );
    if (!hit?.url) {
      return {
        candidates: [],
        limitation: "Search hits lacked attributable decision-maker identity",
      };
    }

    const nameMatch = (hit.title || "").match(
      /^([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)/,
    );
    if (!nameMatch) {
      return {
        candidates: [],
        limitation:
          "Could not extract a person name from public results without guessing",
      };
    }

    return {
      candidates: [
        {
          fullName: nameMatch[1]!,
          currentRole: "Role uncertain — needs human verification",
          decisionMakerType: "other",
          summary: sanitizeProfessionalText(hit.description || hit.title || ""),
          priorities: [],
          opportunities: [],
          evidence: [
            {
              claim: `Public search associates ${nameMatch[1]} with ${input.company}`,
              excerpt: hit.description || hit.title || "",
              sourceUrl: hit.url,
              sourceType: "brave_search",
              kind: "hypothesis",
            },
          ],
          channels: input.domain
            ? [
                {
                  channelType: "company_contact_form" as const,
                  value: `https://${input.domain}/contact`,
                  provenance: "company_level" as const,
                  sourceUrl: `https://${input.domain}/contact`,
                  discoveryMethod: "company_contact_path_unverified",
                  allowedForAutomation: false,
                },
              ]
            : [],
        },
      ],
    };
  } catch (error) {
    return {
      candidates: [],
      limitation:
        error instanceof Error
          ? `Provider failure: ${error.message}`
          : "Provider failure — no fabricated research",
    };
  }
}
