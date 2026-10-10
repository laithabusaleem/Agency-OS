import { createHmac, timingSafeEqual } from "node:crypto";

type TokenPayload = {
  org: string;
  email: string;
  exp: number;
};

function secret() {
  const value =
    process.env.OUTREACH_UNSUBSCRIBE_SECRET || process.env.SESSION_SECRET || "";
  if (!value || value.length < 32) {
    throw new Error("OUTREACH_UNSUBSCRIBE_SECRET or SESSION_SECRET required");
  }
  return value;
}

function b64url(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64url(input: string) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64").toString("utf8");
}

export function signUnsubscribeToken(input: {
  organizationId: string;
  email: string;
  ttlSeconds?: number;
}): string {
  const payload: TokenPayload = {
    org: input.organizationId,
    email: input.email.trim().toLowerCase(),
    exp:
      Math.floor(Date.now() / 1000) + (input.ttlSeconds ?? 60 * 60 * 24 * 180),
  };
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret()).update(body).digest();
  return `${body}.${b64url(sig)}`;
}

export function verifyUnsubscribeToken(
  token: string,
): { ok: true; org: string; email: string } | { ok: false; reason: string } {
  try {
    const [body, sig] = token.split(".");
    if (!body || !sig) return { ok: false, reason: "malformed" };
    const expected = createHmac("sha256", secret()).update(body).digest();
    const actual = Buffer.from(
      sig.replace(/-/g, "+").replace(/_/g, "/") +
        "=".repeat((4 - (sig.length % 4)) % 4),
      "base64",
    );
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      return { ok: false, reason: "bad_signature" };
    }
    const payload = JSON.parse(fromB64url(body)) as TokenPayload;
    if (!payload.org || !payload.email || !payload.exp) {
      return { ok: false, reason: "invalid_payload" };
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return { ok: false, reason: "expired" };
    }
    return {
      ok: true,
      org: payload.org,
      email: payload.email.trim().toLowerCase(),
    };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

export function buildUnsubscribeUrl(input: {
  baseUrl: string;
  organizationId: string;
  email: string;
}) {
  const token = signUnsubscribeToken({
    organizationId: input.organizationId,
    email: input.email,
  });
  const url = new URL(input.baseUrl);
  url.searchParams.set("token", token);
  return url.toString();
}
