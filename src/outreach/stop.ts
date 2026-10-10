import { and, eq, inArray } from "drizzle-orm";
import { isEmailSuppressed } from "@/outreach/gates";
import type { AppDatabase } from "@/db/factory";
import {
  followUpSchedules,
  outreachEvents,
  outreachMessages,
  suppressionList,
} from "@/db/schema";
import { createId } from "@/lib/id";

function now() {
  return new Date().toISOString();
}

/**
 * Reply / opt-out / complaint stop — cancels pending messages and follow-ups.
 */
export async function applyStopConditionWithDb(
  db: AppDatabase,
  organizationId: string,
  email: string,
  type: "unsubscribed" | "bounced" | "complained" | "replied" | "stopped",
) {
  const normalized = email.trim().toLowerCase();

  if (type !== "replied") {
    const reason =
      type === "unsubscribed"
        ? "unsubscribe"
        : type === "bounced"
          ? "bounce"
          : type === "complained"
            ? "complaint"
            : "reply_stop";
    const existing = await isEmailSuppressed(db, organizationId, normalized);
    if (!existing) {
      await db.insert(suppressionList).values({
        id: createId("osupp"),
        organizationId,
        email: normalized,
        reason,
        source: "stop_condition",
        createdAt: now(),
      });
    }
  } else {
    const existing = await isEmailSuppressed(db, organizationId, normalized);
    if (!existing) {
      await db.insert(suppressionList).values({
        id: createId("osupp"),
        organizationId,
        email: normalized,
        reason: "reply_stop",
        source: "reply_detection",
        notes: "Stopped further automated follow-ups after reply",
        createdAt: now(),
      });
    }
  }

  const pending = await db.query.outreachMessages.findMany({
    where: and(
      eq(outreachMessages.organizationId, organizationId),
      eq(outreachMessages.toEmail, normalized),
      inArray(outreachMessages.status, [
        "draft",
        "in_review",
        "approved",
        "scheduled",
      ]),
    ),
  });
  for (const msg of pending) {
    await db
      .update(outreachMessages)
      .set({
        status: "cancelled",
        updatedAt: now(),
        reviewNote: `Stopped: ${type}`,
      })
      .where(eq(outreachMessages.id, msg.id));
  }

  const follows = await db.query.followUpSchedules.findMany({
    where: and(
      eq(followUpSchedules.organizationId, organizationId),
      eq(followUpSchedules.status, "scheduled"),
    ),
  });
  for (const follow of follows) {
    const msg = await db.query.outreachMessages.findFirst({
      where: eq(outreachMessages.id, follow.messageId),
    });
    if (msg?.toEmail.toLowerCase() === normalized) {
      await db
        .update(followUpSchedules)
        .set({
          status: "stopped",
          stopReason: type,
          updatedAt: now(),
        })
        .where(eq(followUpSchedules.id, follow.id));
    }
  }

  await db.insert(outreachEvents).values({
    id: createId("oevent"),
    organizationId,
    type:
      type === "unsubscribed"
        ? "unsubscribed"
        : type === "bounced"
          ? "bounced"
          : type === "complained"
            ? "complained"
            : type === "replied"
              ? "replied"
              : "stopped",
    email: normalized,
    payloadJson: JSON.stringify({ type }),
    createdAt: now(),
  });
}
