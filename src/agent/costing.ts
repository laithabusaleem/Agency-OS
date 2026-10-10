import type { AgentProviderId, TokenUsage } from "@/agent/types";

/** Rough USD cents per 1K tokens (prompt/completion blended) for estimation only. */
const RATE_CENTS_PER_1K: Record<AgentProviderId, number> = {
  mock: 0,
  gemini: 0.015,
  groq: 0.05,
  openrouter: 0.15,
};

export function estimateCostCents(
  provider: AgentProviderId,
  usage: TokenUsage,
): number {
  const rate = RATE_CENTS_PER_1K[provider];
  const tokens =
    usage.totalTokens || usage.promptTokens + usage.completionTokens;
  return Math.max(0, Math.ceil((tokens / 1000) * rate * 100) / 100);
}

export function emptyUsage(): TokenUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

export function estimateTokensFromText(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
