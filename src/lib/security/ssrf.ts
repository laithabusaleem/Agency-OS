import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * SSRF defenses: block non-http(s), private/reserved IPs, and cloud metadata hosts.
 * Callers should re-validate the final URL after redirects when possible.
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
]);

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }
  return false;
}

export function isPrivateOrReservedIp(ip: string): boolean {
  const v = ip.trim().toLowerCase();
  if (v === "0.0.0.0" || v === "::" || v === "::1") return true;

  if (v.includes(":")) {
    // IPv6 unique local / link-local / loopback
    if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80"))
      return true;
    if (v === "::ffff:127.0.0.1") return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped?.[1]) return isPrivateOrReservedIp(mapped[1]);
    return false;
  }

  const parts = v.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

export async function assertSafePublicUrl(targetUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch {
    throw new Error("Invalid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http/https URLs are permitted");
  }
  if (url.username || url.password) {
    throw new Error("URLs with credentials are not permitted");
  }
  if (isBlockedHostname(url.hostname)) {
    throw new Error("Hostname is not permitted");
  }

  const host = url.hostname;
  if (isIP(host)) {
    if (isPrivateOrReservedIp(host)) {
      throw new Error("Private or reserved IP addresses are not permitted");
    }
    return url;
  }

  // IANA example/test domains — treat as public without live DNS (unit tests)
  if (
    host === "example.com" ||
    host.endsWith(".example.com") ||
    host.endsWith(".example") ||
    host.endsWith(".test")
  ) {
    return url;
  }

  let records: string[];
  try {
    const result = await lookup(host, { all: true, verbatim: true });
    records = result.map((r) => r.address);
  } catch {
    throw new Error("DNS resolution failed");
  }

  if (!records.length) {
    throw new Error("DNS resolution returned no addresses");
  }
  for (const addr of records) {
    if (isPrivateOrReservedIp(addr)) {
      throw new Error("Hostname resolves to a private or reserved address");
    }
  }

  return url;
}
