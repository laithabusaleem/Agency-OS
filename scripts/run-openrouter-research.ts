/**
 * One-shot live lead research via OpenRouter web search.
 * Usage: npx tsx --env-file=.env.local scripts/run-openrouter-research.ts "query" [market] [niche]
 */
import { and, eq } from "drizzle-orm";
import { researchProspects } from "../src/acquisition/pipeline";
import { resetAcquisitionEnvCache } from "../src/acquisition/config";
import { resetAgentEnvCache } from "../src/agent/config";
import { openDatabase } from "../src/db/factory";
import { acquisitionRuns, leadEvidence, leads, users } from "../src/db/schema";
import { createId } from "../src/lib/id";

async function main() {
  resetAcquisitionEnvCache();
  resetAgentEnvCache();

  const query =
    process.argv[2] || "independent branding studios in Austin Texas";
  const market = process.argv[3] || "US";
  const niche = process.argv[4] || "branding";

  const handle = openDatabase(
    process.env.DATABASE_PATH ?? "./data/agency.sqlite",
  );
  const user = await handle.db.query.users.findFirst({
    where: eq(users.email, "demo@agency.local"),
  });
  if (!user) throw new Error("Demo user not found — run npm run db:seed");

  const runId = createId("acqrun");
  const stamp = new Date().toISOString();
  await handle.db.insert(acquisitionRuns).values({
    id: runId,
    organizationId: user.organizationId,
    createdByUserId: user.id,
    query,
    market,
    niche,
    provider: "openrouter",
    status: "running",
    createdAt: stamp,
    updatedAt: stamp,
  });

  try {
    const result = await researchProspects({
      query,
      market,
      niche,
      provider: "openrouter",
    });

    let created = 0;
    let deduped = 0;
    for (const item of result.prospects) {
      const domain = item.prospect.domain;
      const existing = domain
        ? await handle.db.query.leads.findFirst({
            where: and(
              eq(leads.organizationId, user.organizationId),
              eq(leads.domain, domain),
            ),
          })
        : undefined;

      const leadId = existing?.id ?? createId("lead");
      if (existing) {
        deduped += 1;
        await handle.db
          .update(leads)
          .set({
            name: item.prospect.name,
            company: item.prospect.company || existing.company,
            websiteUrl: item.prospect.websiteUrl || existing.websiteUrl,
            market: item.prospect.market || existing.market,
            niche: item.prospect.niche || existing.niche,
            notes: item.prospect.notes || existing.notes,
            source: item.prospect.source,
            acquisitionSource: item.prospect.acquisitionSource,
            email: item.prospect.email || existing.email,
            emailProvenance: item.prospect.email
              ? item.prospect.emailProvenance
              : existing.emailProvenance,
            lastRetrievedAt: stamp,
            updatedAt: stamp,
          })
          .where(eq(leads.id, existing.id));
      } else {
        created += 1;
        await handle.db.insert(leads).values({
          id: leadId,
          organizationId: user.organizationId,
          name: item.prospect.name,
          email: item.prospect.email,
          emailProvenance: item.prospect.emailProvenance,
          phone: item.prospect.phone || null,
          phoneProvenance: item.prospect.phoneProvenance,
          nameProvenance: item.prospect.nameProvenance,
          company: item.prospect.company || null,
          domain: item.prospect.domain,
          websiteUrl: item.prospect.websiteUrl,
          market: item.prospect.market || null,
          niche: item.prospect.niche || null,
          serviceFit: 60,
          score: 50,
          status: "new",
          source: item.prospect.source,
          notes: item.prospect.notes || null,
          acquisitionSource: item.prospect.acquisitionSource,
          lastRetrievedAt: stamp,
          isDemo: false,
          createdAt: stamp,
          updatedAt: stamp,
        });
      }

      for (const ev of item.evidence) {
        await handle.db.insert(leadEvidence).values({
          id: createId("lev"),
          organizationId: user.organizationId,
          leadId,
          kind: ev.kind,
          field: ev.field,
          claim: ev.claim,
          value: ev.value ?? null,
          sourceType: ev.sourceType,
          sourceUrl: ev.sourceUrl ?? null,
          rawExcerpt: ev.rawExcerpt ?? null,
          retrievedAt: ev.retrievedAt,
          createdAt: stamp,
        });
      }
    }

    await handle.db
      .update(acquisitionRuns)
      .set({
        status: result.prospects.length ? "succeeded" : "partial",
        resultsCount: result.hits.length,
        createdCount: created,
        dedupedCount: deduped,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(acquisitionRuns.id, runId));

    console.log(
      JSON.stringify(
        {
          ok: true,
          query,
          hits: result.hits.map((h) => ({
            title: h.title,
            url: h.url,
          })),
          created,
          deduped,
          runId,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await handle.db
      .update(acquisitionRuns)
      .set({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(acquisitionRuns.id, runId));
    throw error;
  } finally {
    handle.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
