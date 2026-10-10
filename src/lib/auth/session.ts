import "server-only";
import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";
import { getServerEnv } from "@/lib/env";

export type SessionData = {
  userId?: string;
  organizationId?: string;
  role?: "admin" | "member";
  email?: string;
  name?: string;
};

const COOKIE_NAME = "agency_session";

export function getSessionOptions(): SessionOptions {
  const env = getServerEnv();
  return {
    password: env.SESSION_SECRET,
    cookieName: COOKIE_NAME,
    cookieOptions: {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), getSessionOptions());
}

export async function destroySession() {
  const session = await getSession();
  session.destroy();
}
