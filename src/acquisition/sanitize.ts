/**
 * Strip common prompt-injection / instruction-override patterns from retrieved
 * public content before storing excerpts or feeding models.
 */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/gi,
  /disregard\s+(all\s+)?(previous|prior|above)/gi,
  /system\s*prompt\s*:/gi,
  /you\s+are\s+now\s+/gi,
  /<\/?system>/gi,
  /<\/?assistant>/gi,
  /```(?:json)?\s*\{\s*"role"\s*:\s*"system"/gi,
  /do\s+not\s+follow\s+your\s+(safety|prior)\s+rules/gi,
  /exfiltrate|exfiltration/gi,
];

export function sanitizeRetrievedText(input: string, maxLen = 4000): string {
  let text = input.replace(/\0/g, " ");
  for (const pattern of INJECTION_PATTERNS) {
    text = text.replace(pattern, "[filtered]");
  }
  // Collapse noisy whitespace
  text = text.replace(/\s+/g, " ").trim();
  return text.slice(0, maxLen);
}

export function detectPromptInjection(input: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(input);
  });
}

/** Extract emails only from observed page text — never synthesize. */
export function extractObservedEmails(text: string): string[] {
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  const unique = [...new Set(matches.map((m) => m.toLowerCase()))];
  // Drop obvious junk / example domains often used in injection payloads
  return unique.filter(
    (email) =>
      !email.endsWith("@example.com") &&
      !email.endsWith(".example.com") &&
      !email.includes("ignore@") &&
      !email.includes("system@prompt"),
  );
}
