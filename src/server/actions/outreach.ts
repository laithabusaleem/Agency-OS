"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OutreachGateError } from "@/outreach/errors";
import { logger } from "@/lib/logger";
import { AuthorizationError, requireUser } from "@/server/authz";
import * as outreach from "@/server/services/outreach";

export type OutreachActionState = {
  ok: boolean;
  message?: string;
  id?: string;
};

export async function createAuditAction(
  _prev: OutreachActionState,
  formData: FormData,
): Promise<OutreachActionState> {
  try {
    const user = await requireUser();
    const leadId = String(formData.get("leadId") ?? "");
    const title = String(formData.get("title") ?? "");
    const summary = String(formData.get("summary") ?? "");
    if (!leadId || !title)
      return { ok: false, message: "Lead and title required." };

    const result = await outreach.createBusinessAudit(user, {
      leadId,
      title,
      summary,
      findings: [
        {
          kind: "fact",
          title: "Evidence-backed starting point",
          detail: summary || "Audit created from lead evidence pack",
          severity: "medium",
        },
        {
          kind: "unknown",
          title: "Unverified opportunities",
          detail: "Not inferred beyond available evidence",
          severity: "low",
        },
      ],
    });
    revalidatePath("/outreach");
    return { ok: true, message: "Audit created.", id: result?.audit.id };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Audit failed",
    };
  }
}

export async function createCampaignAction(
  _prev: OutreachActionState,
  formData: FormData,
): Promise<OutreachActionState> {
  try {
    const user = await requireUser();
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { ok: false, message: "Name required." };
    const campaign = await outreach.createCampaign(user, {
      name,
      sendLimit: Number(formData.get("sendLimit") || 50),
    });
    revalidatePath("/outreach");
    return { ok: true, message: "Campaign created.", id: campaign?.id };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Campaign failed",
    };
  }
}

export async function submitCampaignReviewAction(formData: FormData) {
  const user = await requireUser();
  await outreach.submitCampaignForReview(
    user,
    String(formData.get("id") ?? ""),
  );
  revalidatePath("/outreach");
}

export async function approveCampaignAction(formData: FormData) {
  const user = await requireUser();
  await outreach.approveCampaign(
    user,
    String(formData.get("id") ?? ""),
    String(formData.get("note") ?? "Approved"),
  );
  revalidatePath("/outreach");
}

export async function stopCampaignAction(formData: FormData) {
  const user = await requireUser();
  await outreach.stopCampaign(
    user,
    String(formData.get("id") ?? ""),
    String(formData.get("reason") ?? "Stopped by operator"),
  );
  revalidatePath("/outreach");
}

export async function createDraftAction(
  _prev: OutreachActionState,
  formData: FormData,
): Promise<OutreachActionState> {
  try {
    const user = await requireUser();
    const schema = z.object({
      leadId: z.string().min(1),
      campaignId: z.string().optional(),
      auditId: z.string().optional(),
      type: z.enum([
        "audit_summary",
        "personalized_outreach",
        "proposal",
        "follow_up",
      ]),
      scheduledFor: z.string().optional(),
      serviceName: z.string().optional(),
      scope: z.string().optional(),
      investment: z.string().optional(),
    });
    const parsed = schema.safeParse({
      leadId: formData.get("leadId"),
      campaignId: formData.get("campaignId") || undefined,
      auditId: formData.get("auditId") || undefined,
      type: formData.get("type"),
      scheduledFor: formData.get("scheduledFor") || undefined,
      serviceName: formData.get("serviceName") || undefined,
      scope: formData.get("scope") || undefined,
      investment: formData.get("investment") || undefined,
    });
    if (!parsed.success) return { ok: false, message: "Invalid draft form." };

    const message = await outreach.createMessageDraft(user, parsed.data);
    revalidatePath("/outreach");
    revalidatePath("/outreach/review");
    return { ok: true, message: "Draft created.", id: message?.id };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Draft failed",
    };
  }
}

export async function submitMessageReviewAction(formData: FormData) {
  const user = await requireUser();
  await outreach.submitMessageForReview(user, String(formData.get("id") ?? ""));
  revalidatePath("/outreach/review");
}

export async function approveMessageAction(formData: FormData) {
  const user = await requireUser();
  await outreach.approveMessage(
    user,
    String(formData.get("id") ?? ""),
    String(formData.get("note") ?? ""),
  );
  revalidatePath("/outreach/review");
  revalidatePath("/outreach");
}

export async function sendMessageAction(
  _prev: OutreachActionState,
  formData: FormData,
): Promise<OutreachActionState> {
  try {
    const user = await requireUser();
    const messageId = String(formData.get("messageId") ?? "");
    const idempotencyKey =
      String(formData.get("idempotencyKey") ?? "") ||
      `send_${messageId}_${user.id}`;
    const result = await outreach.sendApprovedMessage(
      user,
      messageId,
      idempotencyKey,
    );
    revalidatePath("/outreach");
    return {
      ok: true,
      message: result.replay
        ? `Idempotent replay — status ${result.send.status}`
        : `Sent via ${result.send.provider}`,
      id: result.send.id,
    };
  } catch (error) {
    if (error instanceof OutreachGateError) {
      return { ok: false, message: `${error.code}: ${error.message}` };
    }
    if (error instanceof AuthorizationError) {
      return { ok: false, message: error.message };
    }
    logger.error({ err: error }, "send failed");
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Send failed",
    };
  }
}

export async function setSendingEnabledAction(formData: FormData) {
  const user = await requireUser();
  await outreach.adminSetSendingEnabled(
    user,
    String(formData.get("enabled")) === "true",
  );
  revalidatePath("/outreach");
  revalidatePath("/settings");
}

export async function setEmergencyStopAction(formData: FormData) {
  const user = await requireUser();
  await outreach.adminSetEmergencyStop(
    user,
    String(formData.get("enabled")) === "true",
  );
  revalidatePath("/outreach");
}

export async function addSuppressionAction(formData: FormData) {
  const user = await requireUser();
  await outreach.addSuppression(
    user,
    String(formData.get("email") ?? ""),
    "manual",
    String(formData.get("notes") ?? ""),
  );
  revalidatePath("/outreach");
}
