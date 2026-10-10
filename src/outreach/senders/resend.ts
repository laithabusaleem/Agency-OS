import { getOutreachEnv } from "@/outreach/config";
import {
  RESEND_PERMITTED_CATEGORIES,
  type EmailCategory,
  type EmailSender,
  type OutboundEmail,
  type SendResult,
} from "@/outreach/types";

/**
 * Resend adapter for permitted categories only.
 *
 * Limitations (documented):
 * - Requires verified domain / from address in Resend
 * - Does not bypass campaign approval or server send gates
 * - Reply detection depends on Resend webhooks / inbound routing (best-effort)
 * - Not a bulk ESP; respect Resend Acceptable Use + local quotas
 * - Marketing cold email may be restricted by Resend policy — operators must comply
 */
export class ResendEmailSender implements EmailSender {
  readonly id = "resend";

  isConfigured() {
    const env = getOutreachEnv();
    return Boolean(env.RESEND_API_KEY && env.OUTREACH_FROM_EMAIL);
  }

  supportsCategory(category: EmailCategory) {
    return RESEND_PERMITTED_CATEGORIES.includes(category);
  }

  async send(email: OutboundEmail): Promise<SendResult> {
    const env = getOutreachEnv();
    if (!env.RESEND_API_KEY) {
      return {
        ok: false,
        provider: this.id,
        code: "sender_unconfigured",
        message: "RESEND_API_KEY is not configured",
        retryable: false,
      };
    }
    if (!this.supportsCategory(email.category)) {
      return {
        ok: false,
        provider: this.id,
        code: "category_not_permitted",
        message: `Category ${email.category} is not permitted for Resend adapter`,
        retryable: false,
      };
    }

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": email.idempotencyKey,
        },
        body: JSON.stringify({
          from: email.fromName
            ? `${email.fromName} <${email.from}>`
            : email.from,
          to: [email.to],
          subject: email.subject,
          text: email.text,
          html: email.html,
          headers: {
            ...email.headers,
            "X-Entity-Ref-ID": email.idempotencyKey,
          },
          tags: Object.entries(email.tags ?? {}).map(([name, value]) => ({
            name,
            value,
          })),
        }),
        signal: AbortSignal.timeout(20_000),
      });

      const payload = (await res.json().catch(() => ({}))) as {
        id?: string;
        message?: string;
        name?: string;
      };

      if (res.status === 429) {
        return {
          ok: false,
          provider: this.id,
          code: "rate_limited",
          message: payload.message ?? "Resend rate limited",
          retryable: true,
        };
      }
      if (!res.ok) {
        return {
          ok: false,
          provider: this.id,
          code: payload.name ?? "provider_error",
          message: payload.message ?? `Resend HTTP ${res.status}`,
          retryable: res.status >= 500,
        };
      }

      return {
        ok: true,
        provider: this.id,
        providerMessageId: payload.id ?? email.idempotencyKey,
      };
    } catch (error) {
      return {
        ok: false,
        provider: this.id,
        code: "network",
        message: error instanceof Error ? error.message : String(error),
        retryable: true,
      };
    }
  }
}
