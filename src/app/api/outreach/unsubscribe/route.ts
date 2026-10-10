import { NextResponse } from "next/server";
import { verifyUnsubscribeToken } from "@/lib/security/unsubscribe-token";
import { handleUnsubscribe } from "@/server/services/outreach";

/**
 * Public unsubscribe endpoint — requires HMAC token (not raw org+email).
 * Response does not reveal whether the address was previously unknown.
 */
async function processToken(token: string | null) {
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "missing_token" },
      { status: 400 },
    );
  }
  const verified = verifyUnsubscribeToken(token);
  if (!verified.ok) {
    return NextResponse.json(
      { ok: false, error: "invalid_token" },
      { status: 401 },
    );
  }
  await handleUnsubscribe(verified.org, verified.email);
  return NextResponse.json({
    ok: true,
    message: "You have been unsubscribed from automated outreach.",
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return processToken(searchParams.get("token"));
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { token?: string };
  const { searchParams } = new URL(request.url);
  return processToken(body.token ?? searchParams.get("token"));
}
