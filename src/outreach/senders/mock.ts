import type { EmailSender, OutboundEmail, SendResult } from "@/outreach/types";

/** Deterministic test sender — never used as a silent production fallback. */
export class MockEmailSender implements EmailSender {
  readonly id = "mock";
  readonly sent: OutboundEmail[] = [];

  isConfigured() {
    return true;
  }

  supportsCategory() {
    return true;
  }

  async send(email: OutboundEmail): Promise<SendResult> {
    if (email.to.includes("fail@")) {
      return {
        ok: false,
        provider: this.id,
        code: "provider_error",
        message: "Simulated provider failure",
        retryable: true,
      };
    }
    this.sent.push(email);
    return {
      ok: true,
      provider: this.id,
      providerMessageId: `mock_${email.idempotencyKey}`,
    };
  }
}
