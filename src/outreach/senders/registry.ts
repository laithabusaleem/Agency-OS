import { getOutreachEnv } from "@/outreach/config";
import { DisabledSender } from "@/outreach/senders/disabled";
import { MockEmailSender } from "@/outreach/senders/mock";
import { ResendEmailSender } from "@/outreach/senders/resend";
import type { EmailSender } from "@/outreach/types";

const disabled = new DisabledSender();
const resend = new ResendEmailSender();

/** Test-only injectable mock. */
let testSender: EmailSender | null = null;

export function setTestEmailSender(sender: EmailSender | null) {
  testSender = sender;
}

/**
 * Resolve the active sender.
 * Never silently falls back to mock in production.
 * If sending is disabled or provider missing → DisabledSender.
 */
export function getEmailSender(): EmailSender {
  if (testSender) return testSender;

  const env = getOutreachEnv();
  if (!env.OUTREACH_SENDING_ENABLED || env.OUTREACH_EMERGENCY_STOP) {
    return disabled;
  }
  if (resend.isConfigured()) {
    return resend;
  }
  return disabled;
}

export function listSenderStatus() {
  const env = getOutreachEnv();
  return [
    {
      id: "disabled",
      name: "Disabled (default)",
      configured: true,
      active:
        !env.OUTREACH_SENDING_ENABLED ||
        env.OUTREACH_EMERGENCY_STOP ||
        !resend.isConfigured(),
    },
    {
      id: "resend",
      name: "Resend",
      configured: resend.isConfigured(),
      active:
        env.OUTREACH_SENDING_ENABLED &&
        !env.OUTREACH_EMERGENCY_STOP &&
        resend.isConfigured(),
      permittedCategories: ["transactional", "approved_outreach"],
    },
    {
      id: "mock",
      name: "Mock (tests only)",
      configured: Boolean(testSender instanceof MockEmailSender),
      active: Boolean(testSender),
    },
  ];
}
