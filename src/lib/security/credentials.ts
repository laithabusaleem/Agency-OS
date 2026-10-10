import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

/**
 * Optional encrypted-at-rest helper for integration credentials.
 *
 * v1 default: secrets live in process env (see docs/THREAT_MODEL.md).
 * When CREDENTIALS_ENCRYPTION_KEY (32+ chars) is set, callers can seal
 * org-scoped secrets before persisting them to the database.
 */

function deriveKey(secret: string) {
  return createHash("sha256").update(secret).digest();
}

export function isCredentialsEncryptionConfigured() {
  const key = process.env.CREDENTIALS_ENCRYPTION_KEY;
  return Boolean(key && key.length >= 32);
}

export function sealSecret(plaintext: string): string {
  const secret = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY must be at least 32 characters",
    );
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function openSecret(sealed: string): string {
  const secret = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY must be at least 32 characters",
    );
  }
  const [version, ivB64, tagB64, dataB64] = sealed.split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid sealed secret format");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveKey(secret),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}
