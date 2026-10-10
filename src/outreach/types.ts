export const EMAIL_CATEGORIES = ["transactional", "approved_outreach"] as const;
export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];

/** Categories Resend adapter is permitted to send. */
export const RESEND_PERMITTED_CATEGORIES: readonly EmailCategory[] = [
  "transactional",
  "approved_outreach",
] as const;

export const CAMPAIGN_STATUSES = [
  "draft",
  "pending_review",
  "approved",
  "active",
  "paused",
  "completed",
  "stopped",
  "rejected",
] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const SENDABLE_CAMPAIGN_STATUSES: readonly CampaignStatus[] = [
  "approved",
  "active",
] as const;

export type SendGateFailureCode =
  | "sending_disabled"
  | "emergency_stop"
  | "missing_approval"
  | "invalid_campaign_status"
  | "suppressed"
  | "ineligible_recipient"
  | "quota_exhausted"
  | "campaign_limit"
  | "rate_limited"
  | "sender_unconfigured"
  | "category_not_permitted"
  | "stop_condition"
  | "message_not_approved"
  | "idempotent_replay";

export type SendGateResult =
  | { ok: true }
  | {
      ok: false;
      code: SendGateFailureCode;
      message: string;
    };

export type OutboundEmail = {
  to: string;
  from: string;
  fromName?: string;
  subject: string;
  text: string;
  html?: string;
  category: EmailCategory;
  idempotencyKey: string;
  headers?: Record<string, string>;
  tags?: Record<string, string>;
};

export type SendResult =
  | {
      ok: true;
      provider: string;
      providerMessageId: string;
    }
  | {
      ok: false;
      provider: string;
      code: string;
      message: string;
      retryable: boolean;
    };

export interface EmailSender {
  readonly id: string;
  isConfigured(): boolean;
  supportsCategory(category: EmailCategory): boolean;
  send(email: OutboundEmail): Promise<SendResult>;
}
