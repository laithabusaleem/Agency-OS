"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { destroySession, getSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { loginSchema } from "@/lib/validations/auth";
import { toPublicSession } from "@/server/authz";

export type AuthActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function loginAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the form and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const db = getDb();
  const user = await db.query.users.findFirst({
    where: eq(users.email, parsed.data.email),
  });

  if (!user) {
    logger.info({ email: parsed.data.email }, "login failed: unknown user");
    return { ok: false, message: "Invalid email or password." };
  }

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!valid) {
    logger.info({ userId: user.id }, "login failed: bad password");
    return { ok: false, message: "Invalid email or password." };
  }

  const session = await getSession();
  Object.assign(
    session,
    toPublicSession({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
    }),
  );
  await session.save();
  logger.info({ userId: user.id }, "login success");
  redirect("/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
