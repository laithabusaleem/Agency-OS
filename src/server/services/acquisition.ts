import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getAcquisitionEnv } from "@/acquisition/config";
import {
  exportLeadsCsv,
  parseLeadsCsv,
  type CsvLeadRow,
} from "@/acquisition/csv";
import { normalizeProspect } from "@/acquisition/normalize";
import { researchProspects } from "@/acquisition/pipeline";
import {
  computeWeightedScore,
  defaultScoreFactors,
} from "@/acquisition/scoring";
import type {
  LeadFilters,
  ResearchProviderId,
  ScoreFactorInput,
} from "@/acquisition/types";
import { getDb } from "@/db/client";
import {
  acquisitionRuns,
  leadEvidence,
  leadScoreFactors,
  leads,
} from "@/db/schema";
import { createId } from "@/lib/id";
import type { AuthUser } from "@/server/authz-rules";
import { assertOrgAccess } from "@/server/authz-rules";

function now() {
  return new Date().toISOString();
}

function staleAfterIso() {
  const hours = getAcquisitionEnv().ACQUISITION_EVIDENCE_TTL_HOURS;
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

function markStaleIfNeeded(retrievedAt: string, staleAfterAt: string | null) {
  if (!staleAfterAt) return false;
  return new Date(staleAfterAt).getTime() < Date.now();
}

export async function listLeadsFiltered(
  user: AuthUser,
  filters: LeadFilters = {},
) {
  const db = getDb();
  const conditions = [eq(leads.organizationId, user.organizationId)];
  if (
    filters.status === "new" ||
    filters.status === "contacted" ||
    filters.status === "qualified" ||
    filters.status === "won" ||
    filters.status === "lost"
  ) {
    conditions.push(eq(leads.status, filters.status));
  }
  if (filters.market) conditions.push(eq(leads.market, filters.market));
  if (filters.niche) conditions.push(eq(leads.niche, filters.niche));
  if (filters.domain) conditions.push(eq(leads.domain, filters.domain));
  if (filters.minScore != null)
    conditions.push(gte(leads.score, filters.minScore));
  if (filters.minServiceFit != null) {
    conditions.push(gte(leads.serviceFit, filters.minServiceFit));
  }
  if (filters.q) {
    const q = `%${filters.q}%`;
    conditions.push(
      sql`(${leads.name} like ${q} or ${leads.company} like ${q} or ${leads.email} like ${q} or ${leads.domain} like ${q})`,
    );
  }

  return db.query.leads.findMany({
    where: and(...conditions),
    orderBy: [desc(leads.score), desc(leads.createdAt)],
  });
}

async function findByDomain(organizationId: string, domain: string | null) {
  if (!domain) return null;
  return getDb().query.leads.findFirst({
    where: and(
      eq(leads.organizationId, organizationId),
      eq(leads.domain, domain),
    ),
  });
}

async function writeEvidence(
  leadId: string,
  organizationId: string,
  items: Array<{
    kind: "fact" | "inference" | "unknown";
    field: string;
    claim: string;
    value?: string | null;
    sourceType:
      "brave_search" | "website" | "csv" | "manual" | "model" | "scoring";
    sourceUrl?: string | null;
    rawExcerpt?: string | null;
    retrievedAt: string;
  }>,
) {
  const db = getDb();
  const ids: string[] = [];
  for (const item of items) {
    const id = createId("evid");
    ids.push(id);
    await db.insert(leadEvidence).values({
      id,
      leadId,
      organizationId,
      kind: item.kind,
      field: item.field,
      claim: item.claim,
      value: item.value ?? null,
      sourceType: item.sourceType,
      sourceUrl: item.sourceUrl ?? null,
      rawExcerpt: item.rawExcerpt ?? null,
      retrievedAt: item.retrievedAt,
      staleAfterAt: staleAfterIso(),
      isStale: false,
      createdAt: now(),
    });
  }
  return ids;
}

async function replaceScoreFactors(
  leadId: string,
  organizationId: string,
  factors: ScoreFactorInput[],
) {
  const db = getDb();
  await db.delete(leadScoreFactors).where(eq(leadScoreFactors.leadId, leadId));
  const stamp = now();
  for (const factor of factors) {
    await db.insert(leadScoreFactors).values({
      id: createId("scoref"),
      leadId,
      organizationId,
      key: factor.key,
      label: factor.label,
      points: factor.points,
      weight: factor.weight,
      kind: factor.kind,
      rationale: factor.rationale,
      evidenceIdsJson: JSON.stringify(factor.evidenceIds ?? []),
      editable: true,
      updatedAt: stamp,
      createdAt: stamp,
    });
  }
  const score = computeWeightedScore(factors);
  await db
    .update(leads)
    .set({ score, scoreUpdatedAt: stamp, updatedAt: stamp })
    .where(eq(leads.id, leadId));
  return score;
}

export async function upsertNormalizedLead(
  user: AuthUser,
  row: CsvLeadRow | ReturnType<typeof normalizeProspect>,
  opts?: {
    status?: string;
    serviceFit?: number;
    evidence?: Parameters<typeof writeEvidence>[2];
    allowDuplicateEmail?: boolean;
  },
) {
  const db = getDb();
  const existing = await findByDomain(user.organizationId, row.domain);
  const stamp = now();
  const serviceFit =
    "serviceFit" in row ? Number(row.serviceFit ?? 0) : (opts?.serviceFit ?? 0);
  const status = ("status" in row ? row.status : opts?.status) || "new";

  if (existing) {
    assertOrgAccess(user, existing.organizationId);
    await db
      .update(leads)
      .set({
        name: row.name,
        email: row.email || existing.email,
        emailProvenance:
          row.email && row.emailProvenance === "observed"
            ? "observed"
            : existing.emailProvenance,
        phone: row.phone || existing.phone,
        phoneProvenance:
          row.phone && row.phoneProvenance === "observed"
            ? "observed"
            : existing.phoneProvenance,
        company: row.company || existing.company,
        websiteUrl: row.websiteUrl || existing.websiteUrl,
        market: row.market || existing.market,
        niche: row.niche || existing.niche,
        notes: row.notes || existing.notes,
        source: row.source || existing.source,
        acquisitionSource: row.acquisitionSource,
        serviceFit,
        status: status as typeof leads.$inferSelect.status,
        lastRetrievedAt: stamp,
        updatedAt: stamp,
      })
      .where(eq(leads.id, existing.id));

    const evidenceIds = opts?.evidence
      ? await writeEvidence(existing.id, user.organizationId, opts.evidence)
      : [];

    const factors = defaultScoreFactors({
      hasObservedEmail:
        (row.email && row.emailProvenance === "observed") ||
        existing.emailProvenance === "observed",
      hasWebsite: Boolean(row.websiteUrl || existing.websiteUrl),
      market: row.market || existing.market || undefined,
      niche: row.niche || existing.niche || undefined,
      serviceFit,
      evidenceStale: false,
    }).map((f) => ({ ...f, evidenceIds }));

    await replaceScoreFactors(existing.id, user.organizationId, factors);
    return {
      leadId: existing.id,
      created: false as const,
      deduped: true as const,
    };
  }

  const id = createId("lead");
  await db.insert(leads).values({
    id,
    organizationId: user.organizationId,
    name: row.name,
    email: row.email,
    emailProvenance: row.emailProvenance,
    phone: row.phone || null,
    phoneProvenance: row.phoneProvenance,
    nameProvenance: row.nameProvenance,
    company: row.company || null,
    domain: row.domain,
    websiteUrl: row.websiteUrl,
    market: row.market || null,
    niche: row.niche || null,
    serviceFit,
    score: 0,
    status: status as typeof leads.$inferSelect.status,
    source: row.source,
    notes: row.notes || null,
    acquisitionSource: row.acquisitionSource,
    lastRetrievedAt: stamp,
    isDemo: false,
    createdAt: stamp,
    updatedAt: stamp,
  });

  const evidenceIds = opts?.evidence
    ? await writeEvidence(id, user.organizationId, opts.evidence)
    : await writeEvidence(id, user.organizationId, [
        {
          kind: row.email ? "fact" : "unknown",
          field: "email",
          claim: row.email
            ? "Email provided via manual/CSV (observed)"
            : "Email unknown — not invented",
          value: row.email || null,
          sourceType: row.acquisitionSource === "csv" ? "csv" : "manual",
          retrievedAt: stamp,
        },
      ]);

  const factors = defaultScoreFactors({
    hasObservedEmail: row.emailProvenance === "observed" && Boolean(row.email),
    hasWebsite: Boolean(row.websiteUrl),
    market: row.market || undefined,
    niche: row.niche || undefined,
    serviceFit,
    evidenceStale: false,
  }).map((f) => ({ ...f, evidenceIds }));

  await replaceScoreFactors(id, user.organizationId, factors);
  return { leadId: id, created: true as const, deduped: false as const };
}

export async function importLeadsFromCsv(user: AuthUser, csvText: string) {
  const { rows, errors } = parseLeadsCsv(csvText);
  let created = 0;
  let deduped = 0;
  for (const row of rows) {
    const result = await upsertNormalizedLead(user, row);
    if (result.created) created += 1;
    if (result.deduped) deduped += 1;
  }
  return { created, deduped, errors, total: rows.length };
}

export async function exportOrgLeadsCsv(
  user: AuthUser,
  filters: LeadFilters = {},
) {
  const rows = await listLeadsFiltered(user, filters);
  return exportLeadsCsv(rows);
}

export async function getLeadDetail(user: AuthUser, leadId: string) {
  const db = getDb();
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!lead) return null;
  assertOrgAccess(user, lead.organizationId);

  const evidence = await db.query.leadEvidence.findMany({
    where: eq(leadEvidence.leadId, leadId),
    orderBy: [desc(leadEvidence.retrievedAt)],
  });

  // Refresh stale flags
  for (const item of evidence) {
    const stale = markStaleIfNeeded(item.retrievedAt, item.staleAfterAt);
    if (stale !== item.isStale) {
      await db
        .update(leadEvidence)
        .set({ isStale: stale })
        .where(eq(leadEvidence.id, item.id));
      item.isStale = stale;
    }
  }

  const factors = await db.query.leadScoreFactors.findMany({
    where: eq(leadScoreFactors.leadId, leadId),
  });

  return { lead, evidence, factors };
}

export async function updateLeadScoreFactors(
  user: AuthUser,
  leadId: string,
  factors: ScoreFactorInput[],
) {
  const detail = await getLeadDetail(user, leadId);
  if (!detail) return null;
  const score = await replaceScoreFactors(leadId, user.organizationId, factors);
  await getDb()
    .update(leads)
    .set({
      serviceFit:
        factors.find((f) => f.key === "service_fit")?.points ??
        detail.lead.serviceFit,
      updatedAt: now(),
    })
    .where(eq(leads.id, leadId));
  return score;
}

export async function runAcquisitionResearch(
  user: AuthUser,
  input: {
    query: string;
    market?: string;
    niche?: string;
    provider: ResearchProviderId;
    serviceFit?: number;
  },
) {
  const db = getDb();
  const runId = createId("acqrun");
  const stamp = now();
  await db.insert(acquisitionRuns).values({
    id: runId,
    organizationId: user.organizationId,
    createdByUserId: user.id,
    query: input.query,
    market: input.market ?? null,
    niche: input.niche ?? null,
    provider: input.provider,
    status: "running",
    createdAt: stamp,
    updatedAt: stamp,
  });

  try {
    const result = await researchProspects({
      query: input.query,
      market: input.market,
      niche: input.niche,
      provider: input.provider,
    });

    let created = 0;
    let deduped = 0;
    const { DecisionMakerCoordinator } = await import("@/dmi/coordinator");
    const dmi = new DecisionMakerCoordinator(db);
    for (const item of result.prospects) {
      const upserted = await upsertNormalizedLead(user, item.prospect, {
        serviceFit: input.serviceFit ?? 50,
        evidence: item.evidence,
      });
      if (upserted.created) created += 1;
      if (upserted.deduped) deduped += 1;
      // Schedule decision-maker research after qualification (best-effort)
      if (upserted.leadId) {
        try {
          await dmi.scheduleAfterQualification({
            organizationId: user.organizationId,
            leadId: upserted.leadId,
            targetService: input.niche || "website",
            mode: "mock",
            userId: user.id,
            minScore: 0,
          });
        } catch {
          // Research failure must not invent results or fail acquisition
        }
      }
    }

    await db
      .update(acquisitionRuns)
      .set({
        status: result.prospects.length ? "succeeded" : "partial",
        resultsCount: result.hits.length,
        createdCount: created,
        dedupedCount: deduped,
        updatedAt: now(),
      })
      .where(eq(acquisitionRuns.id, runId));

    return {
      runId,
      hits: result.hits.length,
      created,
      deduped,
      prospects: result.prospects.length,
    };
  } catch (error) {
    await db
      .update(acquisitionRuns)
      .set({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        updatedAt: now(),
      })
      .where(eq(acquisitionRuns.id, runId));
    throw error;
  }
}

export async function refreshEvidenceStaleness(organizationId: string) {
  const db = getDb();
  const rows = await db.query.leadEvidence.findMany({
    where: eq(leadEvidence.organizationId, organizationId),
  });
  let marked = 0;
  for (const row of rows) {
    const stale = markStaleIfNeeded(row.retrievedAt, row.staleAfterAt);
    if (stale && !row.isStale) {
      await db
        .update(leadEvidence)
        .set({ isStale: true })
        .where(eq(leadEvidence.id, row.id));
      marked += 1;
    }
  }
  return marked;
}
