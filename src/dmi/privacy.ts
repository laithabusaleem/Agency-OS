import { SENSITIVE_FIELD_PATTERNS } from "@/dmi/types";

/**
 * Business research only — strip or reject sensitive / unrelated personal content.
 */
export function containsSensitivePersonalInfo(text: string): boolean {
  return SENSITIVE_FIELD_PATTERNS.some((re) => re.test(text));
}

export function sanitizeProfessionalText(text: string): string {
  if (!text) return "";
  let out = text;
  for (const re of SENSITIVE_FIELD_PATTERNS) {
    out = out.replace(re, "[redacted-personal]");
  }
  return out.trim();
}

export function assertBusinessRelevantClaim(claim: string) {
  if (containsSensitivePersonalInfo(claim)) {
    throw new Error(
      "Sensitive or unrelated personal information is excluded from DMI profiles",
    );
  }
}
