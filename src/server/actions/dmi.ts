"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/authz";
import * as dmi from "@/server/services/dmi";

export type DmiActionState = { ok: boolean; message?: string; id?: string };

export async function runDmiResearchAction(
  _prev: DmiActionState,
  formData: FormData,
): Promise<DmiActionState> {
  try {
    const user = await requireUser();
    const parsed = z
      .object({
        leadId: z.string().min(1),
        targetService: z.string().min(1),
        mode: z.enum(["mock", "live"]).default("mock"),
        force: z.string().optional(),
      })
      .safeParse({
        leadId: formData.get("leadId"),
        targetService: formData.get("targetService") || "website",
        mode: formData.get("mode") || "mock",
        force: formData.get("force") || undefined,
      });
    if (!parsed.success) return { ok: false, message: "Invalid research form" };

    const result = await dmi.runResearch(user, {
      ...parsed.data,
      force: parsed.data.force === "true",
    });
    revalidatePath("/intelligence");
    revalidatePath("/leads");
    return {
      ok: true,
      message: result.limitation
        ? `Completed with limitation: ${result.limitation}`
        : `Research complete (${result.candidateIds?.length ?? 0} candidates)`,
      id: result.run.id,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Research failed",
    };
  }
}

export async function createStrategyAction(
  _prev: DmiActionState,
  formData: FormData,
): Promise<DmiActionState> {
  try {
    const user = await requireUser();
    const leadId = String(formData.get("leadId") ?? "");
    const serviceName = String(formData.get("serviceName") || "Website redesign");
    const candidateId = String(formData.get("candidateId") || "") || undefined;
    const strategy = await dmi.createStrategy(user, {
      leadId,
      serviceName,
      candidateId,
    });
    revalidatePath("/intelligence");
    return {
      ok: true,
      message: "Personalized strategy drafted",
      id: strategy?.id,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Strategy failed",
    };
  }
}

export async function rejectCandidateAction(formData: FormData) {
  const user = await requireUser();
  await dmi.rejectCandidate(
    user,
    String(formData.get("candidateId") ?? ""),
    String(formData.get("note") ?? ""),
  );
  revalidatePath("/intelligence");
}

export async function markEvidenceOutdatedAction(formData: FormData) {
  const user = await requireUser();
  await dmi.markEvidenceOutdated(user, String(formData.get("evidenceId") ?? ""));
  revalidatePath("/intelligence");
}

export async function approveStrategyAction(formData: FormData) {
  const user = await requireUser();
  await dmi.approveStrategy(user, String(formData.get("strategyId") ?? ""));
  revalidatePath("/intelligence");
  revalidatePath("/outreach");
}
