import type { NormalizedProspect, ProvenanceKind } from "@/acquisition/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export function normalizeDomain(
  input: string | null | undefined,
): string | null {
  if (!input) return null;
  let value = input.trim().toLowerCase();
  if (!value) return null;
  value = value.replace(/^https?:\/\//, "").replace(/^www\./, "");
  value = value.split("/")[0] ?? value;
  value = value.split("?")[0] ?? value;
  value = value.split(":")[0] ?? value;
  if (!value || value.includes(" ") || !value.includes(".")) return null;
  return value;
}

export function normalizeWebsiteUrl(
  input: string | null | undefined,
): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeEmail(input: string | null | undefined): string {
  if (!input) return "";
  const email = input.trim().toLowerCase();
  if (!email) return "";
  return EMAIL_RE.test(email) ? email : "";
}

export function domainFromEmail(email: string): string | null {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const domain = normalized.split("@")[1] ?? null;
  return normalizeDomain(domain);
}

export function normalizeText(input: string | null | undefined, max = 200) {
  if (!input) return "";
  return input.replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Build a normalized prospect. Contact fields stay empty unless observed.
 * Never invent email/phone.
 */
export function normalizeProspect(input: {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  websiteUrl?: string;
  domain?: string;
  market?: string;
  niche?: string;
  notes?: string;
  source?: string;
  acquisitionSource?: NormalizedProspect["acquisitionSource"];
  nameProvenance?: ProvenanceKind;
  emailProvenance?: ProvenanceKind;
  phoneProvenance?: ProvenanceKind;
}): NormalizedProspect {
  const email = normalizeEmail(input.email);
  const websiteUrl = normalizeWebsiteUrl(input.websiteUrl);
  const domain =
    normalizeDomain(input.domain) ??
    (websiteUrl ? normalizeDomain(new URL(websiteUrl).hostname) : null) ??
    domainFromEmail(email);

  const emailProvenance: ProvenanceKind = email
    ? (input.emailProvenance ?? "observed")
    : "unknown";
  const phone = normalizeText(input.phone, 40);
  const phoneProvenance: ProvenanceKind = phone
    ? (input.phoneProvenance ?? "observed")
    : "unknown";
  const name =
    normalizeText(input.name, 120) || (domain ? domain : "Unknown prospect");
  const nameProvenance: ProvenanceKind = input.name
    ? (input.nameProvenance ?? "observed")
    : domain
      ? "inferred"
      : "unknown";

  return {
    name,
    nameProvenance,
    email,
    emailProvenance,
    phone,
    phoneProvenance,
    company: normalizeText(input.company, 160),
    domain,
    websiteUrl,
    market: normalizeText(input.market, 80),
    niche: normalizeText(input.niche, 80),
    notes: normalizeText(input.notes, 2000),
    source: normalizeText(input.source, 120) || "manual",
    acquisitionSource: input.acquisitionSource ?? "manual",
  };
}
