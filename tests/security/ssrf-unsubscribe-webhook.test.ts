import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  isPrivateOrReservedIp,
  assertSafePublicUrl,
} from "@/lib/security/ssrf";
import {
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from "@/lib/security/unsubscribe-token";
import { verifySvixStyleSignature } from "@/lib/security/webhook";
import {
  fetchPublicPage,
  resetFetchRateLimits,
} from "@/acquisition/fetch/public-fetch";
import { clearRobotsCache } from "@/acquisition/fetch/robots";
import {
  assertInsideRoot,
  resolveInWorkspace,
  workspaceDir,
} from "@/delivery/workspace";
import { DeliveryError } from "@/delivery/errors";
import { sealSecret, openSecret } from "@/lib/security/credentials";

describe("SSRF protections", () => {
  it("flags private and metadata IPs", () => {
    expect(isPrivateOrReservedIp("127.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("10.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("192.168.1.1")).toBe(true);
    expect(isPrivateOrReservedIp("169.254.169.254")).toBe(true);
    expect(isPrivateOrReservedIp("8.8.8.8")).toBe(false);
  });

  it("rejects localhost and private literal URLs", async () => {
    await expect(assertSafePublicUrl("http://127.0.0.1/")).rejects.toThrow(
      /private/i,
    );
    await expect(assertSafePublicUrl("http://localhost/")).rejects.toThrow(
      /not permitted/i,
    );
    await expect(
      assertSafePublicUrl("http://169.254.169.254/latest/meta-data/"),
    ).rejects.toThrow(/private/i);
  });

  it("blocks SSRF targets in fetchPublicPage before network", async () => {
    resetFetchRateLimits();
    clearRobotsCache();
    const page = await fetchPublicPage("http://127.0.0.1:8080/admin");
    expect(page.ok).toBe(false);
    if (!page.ok) expect(page.reason).toBe("unsupported");
  });
});

describe("unsubscribe tokens", () => {
  it("signs and verifies tokens; rejects tampering", () => {
    (process.env as Record<string, string>).SESSION_SECRET =
      "test-session-secret-at-least-32-chars!!";
    const token = signUnsubscribeToken({
      organizationId: "org_1",
      email: "a@b.test",
    });
    const ok = verifyUnsubscribeToken(token);
    expect(ok).toEqual({ ok: true, org: "org_1", email: "a@b.test" });

    const [body, sig] = token.split(".");
    const bad = verifyUnsubscribeToken(`${body}.${sig}tampered`);
    expect(bad.ok).toBe(false);
  });
});

describe("webhook signatures", () => {
  it("accepts valid svix-style signatures and rejects bad ones", () => {
    const secret =
      "whsec_" + Buffer.from("super-secret-webhook-key").toString("base64");
    const rawBody = JSON.stringify({ type: "email.bounced" });
    const t = String(Math.floor(Date.now() / 1000));
    const key = Buffer.from(secret.slice(6), "base64");
    const v1 = createHmac("sha256", key)
      .update(`${t}.${rawBody}`)
      .digest("base64");

    expect(
      verifySvixStyleSignature({
        rawBody,
        signatureHeader: `t=${t},v1=${v1}`,
        secret,
      }),
    ).toEqual({ ok: true });

    expect(
      verifySvixStyleSignature({
        rawBody,
        signatureHeader: `t=${t},v1=deadbeef`,
        secret,
      }).ok,
    ).toBe(false);
  });
});

describe("workspace path traversal", () => {
  it("rejects .. segments and escapes", () => {
    const root = workspaceDir({
      organizationId: "org",
      projectId: "proj",
      workflowId: "wf",
      root: "C:/tmp/workspaces",
    });
    expect(() => resolveInWorkspace(root, "../secret.txt")).toThrow(
      DeliveryError,
    );
    expect(() => assertInsideRoot(root, "C:/tmp/other")).toThrow(DeliveryError);
  });
});

describe("credentials encryption helper", () => {
  it("round-trips sealed secrets when key configured", () => {
    (process.env as Record<string, string>).CREDENTIALS_ENCRYPTION_KEY =
      "credentials-encryption-key-32chars!";
    const sealed = sealSecret("sk_test_123");
    expect(sealed.startsWith("v1:")).toBe(true);
    expect(openSecret(sealed)).toBe("sk_test_123");
  });
});
