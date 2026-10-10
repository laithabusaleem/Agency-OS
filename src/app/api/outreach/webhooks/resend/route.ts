import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getOutreachEnv } from "@/outreach/config";
import { getDb } from "@/db/client";
import { outreachSends } from "@/db/schema";
import { logger } from "@/lib/logger";
import { verifySvixStyleSignature } from "@/lib/security/webhook";
import { applyStopCondition } from "@/server/services/outreach";

function signatureHeaderFromRequest(request: Request): string | null {
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");
  if (svixTimestamp && svixSignature) {
    const v1 = svixSignature
      .split(/\s+/)
      .map((part) => part.trim())
      .find((part) => part.startsWith("v1,"))
      ?.slice(3);
    if (v1) return `t=${svixTimestamp},v1=${v1}`;
  }
  return (
    request.headers.get("resend-signature") ??
    request.headers.get("whsec-signature")
  );
}

/**
 * Resend webhook handler for bounce/complaint/reply stop conditions.
 * Fail-closed: requires RESEND_WEBHOOK_SECRET and a valid signature.
 */
export async function POST(request: Request) {
  const env = getOutreachEnv();
  const rawBody = await request.text();

  if (!env.RESEND_WEBHOOK_SECRET) {
    logger.warn("resend webhook rejected: RESEND_WEBHOOK_SECRET unset");
    return NextResponse.json(
      { ok: false, error: "webhook_unconfigured" },
      { status: 503 },
    );
  }

  const verified = verifySvixStyleSignature({
    rawBody,
    signatureHeader: signatureHeaderFromRequest(request),
    secret: env.RESEND_WEBHOOK_SECRET,
  });
  if (!verified.ok) {
    logger.warn(
      { reason: verified.reason },
      "resend webhook signature rejected",
    );
    return NextResponse.json(
      { ok: false, error: "invalid_signature" },
      { status: 401 },
    );
  }

  let payload: {
    type?: string;
    data?: {
      email_id?: string;
      to?: string[] | string;
      from?: string;
    };
  };
  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (!payload?.type) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const toRaw = payload.data?.to;
  const email = Array.isArray(toRaw) ? toRaw[0] : toRaw;
  const providerMessageId = payload.data?.email_id;

  if (!email) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const db = getDb();
  let organizationId: string | null = null;
  if (providerMessageId) {
    const send = await db.query.outreachSends.findFirst({
      where: eq(outreachSends.providerMessageId, providerMessageId),
    });
    organizationId = send?.organizationId ?? null;
  }

  if (!organizationId) {
    logger.info({ type: payload.type }, "resend webhook without org mapping");
    return NextResponse.json({ ok: true, unmatched: true });
  }

  if (payload.type === "email.bounced") {
    await applyStopCondition(organizationId, email, "bounced");
  } else if (payload.type === "email.complained") {
    await applyStopCondition(organizationId, email, "complained");
  } else if (
    payload.type === "email.received" ||
    payload.type === "email.replied"
  ) {
    await applyStopCondition(organizationId, email, "replied");
  }

  return NextResponse.json({ ok: true });
}
