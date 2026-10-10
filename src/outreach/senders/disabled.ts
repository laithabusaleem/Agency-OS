import type { EmailSender, OutboundEmail, SendResult } from "@/outreach/types";

/**
 * Default sender — refuses all sends.
 * Agents requesting send still hit this unless a real sender is selected
 * AND all server gates pass.
 */
export class DisabledSender implements EmailSender {
  readonly id = "disabled";

  isConfigured() {
    return false;
  }

  supportsCategory() {
    return false;
  }

  async send(email: OutboundEmail): Promise<SendResult> {
    void email;
    return {
      ok: false,
      provider: this.id,
      code: "sending_disabled",
      message:
        "Outbound sending is disabled. Enable OUTREACH_SENDING_ENABLED and configure a provider after explicit campaign approval.",
      retryable: false,
    };
  }
}
