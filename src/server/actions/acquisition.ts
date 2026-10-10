"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { listResearchProviderStatus } from "@/acquisition/providers/registry";
import type { ScoreFactorInput } from "@/acquisition/types";
import { logger } from "@/lib/logger";
import { AuthorizationError, requireUser } from "@/server/authz";
import * as acquisition from "@/server/services/acquisition";

export type AcquisitionActionState = {
  ok: boolean;
  message?: string;
  details?: string;
};

export async function importLeadsCsvAction(
  _prev: AcquisitionActionState,
  formData: FormData,
): Promise<AcquisitionActionState> {
  try {
    const user = await requireUser();
    const csv = String(formData.get("csv") ?? "");
    if (!csv.trim()) return { ok: false, message: "CSV content is required." };
    const result = await acquisition.importLeadsFromCsv(user, csv);
    revalidatePath("/leads");
    return {
      ok: true,
      message: `Imported ${result.total} rows (${result.created} created, ${result.deduped} deduped).`,
      details: result.errors.length
        ? result.errors.slice(0, 5).join(" · ")
        : undefined,
    };
  } catch (error) {
    logger.error({ err: error }, "csv import failed");
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Import failed",
    };
  }
}

export async function runResearchAction(
  _prev: AcquisitionActionState,
  formData: FormData,
): Promise<AcquisitionActionState> {
  try {
    const user = await requireUser();
    const schema = z.object({
      query: z.string().min(2).max(300),
      market: z.string().max(80).optional(),
      niche: z.string().max(80).optional(),
      provider: z.enum(["brave", "openrouter", "mock"]),
      serviceFit: z.coerce.number().int().min(0).max(100).default(50),
    });
    const parsed = schema.safeParse({
      query: formData.get("query"),
      market: formData.get("market") || undefined,
      niche: formData.get("niche") || undefined,
      provider: formData.get("provider"),
      serviceFit: formData.get("serviceFit") || 50,
    });
    if (!parsed.success) {
      return { ok: false, message: "Check research form fields." };
    }
    const result = await acquisition.runAcquisitionResearch(user, parsed.data);
    revalidatePath("/leads");
    return {
      ok: true,
      message: `Research complete: ${result.hits} hits, ${result.created} created, ${result.deduped} deduped.`,
    };
  } catch (error) {
    logger.error({ err: error }, "research run failed");
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Research failed",
    };
  }
}

export async function updateScoreAction(
  _prev: AcquisitionActionState,
  formData: FormData,
): Promise<AcquisitionActionState> {
  try {
    const user = await requireUser();
    const leadId = String(formData.get("leadId") ?? "");
    const raw = String(formData.get("factorsJson") ?? "[]");
    const factors = JSON.parse(raw) as ScoreFactorInput[];
    if (!leadId || !Array.isArray(factors)) {
      return { ok: false, message: "Invalid score payload." };
    }
    const score = await acquisition.updateLeadScoreFactors(
      user,
      leadId,
      factors,
    );
    if (score == null) return { ok: false, message: "Lead not found." };
    revalidatePath("/leads");
    revalidatePath(`/leads/${leadId}`);
    return { ok: true, message: `Score updated to ${score}.` };
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return { ok: false, message: error.message };
    }
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Score update failed",
    };
  }
}

export async function getResearchProvidersAction() {
  await requireUser();
  return listResearchProviderStatus();
}
