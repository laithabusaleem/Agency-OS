import "server-only";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { getSession, type SessionData } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { AuthorizationError, type AuthUser } from "@/server/authz-rules";

export {
  AuthorizationError,
  assertOrgAccess,
  type AuthUser,
} from "@/server/authz-rules";

export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = await getSession();
  if (!session.userId) return null;

  const db = getDb();
  const user = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
  });

  if (!user) {
    session.destroy();
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    organizationId: user.organizationId,
  };
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireUser();
  if (user.role !== "admin") {
    logger.warn({ userId: user.id }, "admin authorization failed");
    throw new AuthorizationError("Admin role required");
  }
  return user;
}

export function toPublicSession(user: AuthUser): SessionData {
  return {
    userId: user.id,
    organizationId: user.organizationId,
    role: user.role,
    email: user.email,
    name: user.name,
  };
}
