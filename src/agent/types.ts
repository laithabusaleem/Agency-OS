import type { z } from "zod";

export const AGENT_PROVIDERS = [
  "mock",
  "gemini",
  "groq",
  "openrouter",
] as const;

export type AgentProviderId = (typeof AGENT_PROVIDERS)[number];

export const AGENT_TYPES = [
  "summarize_text",
  "draft_outreach",
  "extract_entities",
  "research_decision_maker",
] as const;

export type AgentType = (typeof AGENT_TYPES)[number];

export const JOB_STATES = [
  "pending",
  "claimed",
  "running",
  "retry_wait",
  "succeeded",
  "failed",
  "cancelled",
  "dead_letter",
  "timed_out",
] as const;

export type JobState = (typeof JOB_STATES)[number];

export type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type ProviderRequest = {
  provider: AgentProviderId;
  model: string;
  agentType: AgentType;
  prompt: string;
  system?: string;
  /** Attempt number starting at 1 — used by mock for deterministic retry scenarios. */
  attempt: number;
  signal?: AbortSignal;
};

export type ProviderSuccess = {
  ok: true;
  provider: AgentProviderId;
  model: string;
  text: string;
  usage: TokenUsage;
  latencyMs: number;
  estimatedCostCents: number;
  raw?: unknown;
};

export type ProviderFailureCode =
  | "rate_limited"
  | "quota_exhausted"
  | "missing_credentials"
  | "timeout"
  | "invalid_response"
  | "provider_outage"
  | "cancelled"
  | "unknown";

export type ProviderFailure = {
  ok: false;
  provider: AgentProviderId;
  model: string;
  code: ProviderFailureCode;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
  latencyMs: number;
  usage?: TokenUsage;
  estimatedCostCents?: number;
};

export type ProviderResult = ProviderSuccess | ProviderFailure;

export interface AgentProvider {
  readonly id: AgentProviderId;
  isConfigured(): boolean;
  complete(request: ProviderRequest): Promise<ProviderResult>;
}

export type EnqueueJobInput = {
  organizationId: string;
  createdByUserId?: string | null;
  agentType: AgentType;
  provider: AgentProviderId;
  model?: string;
  input: Record<string, unknown>;
  idempotencyKey: string;
  maxAttempts?: number;
  timeoutMs?: number;
  budgetCents?: number;
  availableAt?: string;
};

export type AgentJobRecord = {
  id: string;
  organizationId: string;
  createdByUserId: string | null;
  idempotencyKey: string;
  agentType: AgentType;
  provider: AgentProviderId;
  model: string;
  status: JobState;
  inputJson: string;
  outputJson: string | null;
  errorJson: string | null;
  attemptCount: number;
  maxAttempts: number;
  timeoutMs: number;
  budgetCents: number;
  costCentsEstimate: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number | null;
  workerId: string | null;
  lockedAt: string | null;
  lockExpiresAt: string | null;
  availableAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  cancelledAt: string | null;
  lastError: string | null;
  deadLetterReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StructuredAgentOutput = {
  agentType: AgentType;
  summary: string;
  data: Record<string, unknown>;
};

export type OutputSchemaMap = Record<
  AgentType,
  z.ZodType<StructuredAgentOutput>
>;
