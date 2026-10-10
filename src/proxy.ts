import { NextResponse, type NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import type { SessionData } from "@/lib/auth/session";

const PUBLIC_PATHS = new Set(["/login", "/api/health"]);

function requireSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set to at least 32 characters (proxy fail-closed)",
    );
  }
  return secret;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  let sessionSecret: string;
  try {
    sessionSecret = requireSessionSecret();
  } catch {
    return NextResponse.json(
      { error: "Server misconfigured: SESSION_SECRET" },
      { status: 500 },
    );
  }

  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(request, response, {
    password: sessionSecret,
    cookieName: "agency_session",
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
  });

  const isPublic =
    PUBLIC_PATHS.has(pathname) ||
    pathname === "/" ||
    pathname.startsWith("/api/outreach/unsubscribe") ||
    pathname.startsWith("/api/outreach/webhooks/");
  const isAuthed = Boolean(session.userId);

  if (!isAuthed && !isPublic) {
    const loginUrl = new URL("/login", request.url);
    // Only allow relative in-app paths (open-redirect safe)
    if (pathname.startsWith("/") && !pathname.startsWith("//")) {
      loginUrl.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthed && (pathname === "/login" || pathname === "/")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
