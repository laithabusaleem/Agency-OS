import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify Resend/Svix-style webhook signatures.
 * Header format: t=timestamp,v1=signature
 * Signed payload: `${t}.${rawBody}`
 */
export function verifySvixStyleSignature(input: {
  rawBody: string;
  signatureHeader: string | null;
  secret: string;
  toleranceSeconds?: number;
}): { ok: true } | { ok: false; reason: string } {
  if (!input.secret) {
    return { ok: false, reason: "secret_missing" };
  }
  if (!input.signatureHeader) {
    return { ok: false, reason: "signature_missing" };
  }

  const parts: Record<string, string> = {};
  for (const piece of input.signatureHeader.split(",")) {
    const trimmed = piece.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const k = trimmed.slice(0, eq);
    const v = trimmed.slice(eq + 1);
    parts[k] = v;
  }

  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) {
    return { ok: false, reason: "malformed_header" };
  }

  const ts = Number(timestamp);
  const tolerance = input.toleranceSeconds ?? 300;
  if (!Number.isFinite(ts)) return { ok: false, reason: "bad_timestamp" };
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > tolerance) {
    return { ok: false, reason: "timestamp_out_of_range" };
  }

  // Resend secrets are often prefixed with whsec_
  const key = input.secret.startsWith("whsec_")
    ? Buffer.from(input.secret.slice(6), "base64")
    : Buffer.from(input.secret, "utf8");

  const expected = createHmac("sha256", key)
    .update(`${timestamp}.${input.rawBody}`)
    .digest("base64");

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }
  return { ok: true };
}
