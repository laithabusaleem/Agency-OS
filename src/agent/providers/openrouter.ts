import OpenAI from "openai";
import { getAgentEnv } from "@/agent/config";
import {
  emptyUsage,
  estimateCostCents,
  estimateTokensFromText,
} from "@/agent/costing";
import { MissingCredentialsError } from "@/agent/errors";
import type {
  AgentProvider,
  ProviderRequest,
  ProviderResult,
} from "@/agent/types";

function mapOpenRouterError(
  status: number | undefined,
  message: string,
  retryAfterHeader?: string | null,
): Pick<
  Extract<ProviderResult, { ok: false }>,
  "code" | "message" | "retryable" | "retryAfterMs"
> {
  const retryAfterMs = retryAfterHeader
    ? Number(retryAfterHeader) * 1000
    : undefined;

  if (status === 429) {
    return {
      code: "rate_limited",
      message,
      retryable: true,
      retryAfterMs: Number.isFinite(retryAfterMs) ? retryAfterMs : undefined,
    };
  }
  if (status === 401 || status === 403) {
    return { code: "missing_credentials", message, retryable: false };
  }
  if (
    status === 402 ||
    message.toLowerCase().includes("quota") ||
    message.toLowerCase().includes("credits")
  ) {
    return { code: "quota_exhausted", message, retryable: false };
  }
  if (status && status >= 500) {
    return { code: "provider_outage", message, retryable: true };
  }
  return { code: "unknown", message, retryable: true };
}

export class OpenRouterProvider implements AgentProvider {
  readonly id = "openrouter" as const;

  isConfigured() {
    return Boolean(getAgentEnv().OPENROUTER_API_KEY);
  }

  async complete(request: ProviderRequest): Promise<ProviderResult> {
    const env = getAgentEnv();
    if (!env.OPENROUTER_API_KEY) {
      throw new MissingCredentialsError(this.id);
    }

    const started = Date.now();
    const modelName = request.model || env.OPENROUTER_MODEL;
    const client = new OpenAI({
      apiKey: env.OPENROUTER_API_KEY,
      baseURL: env.OPENROUTER_BASE_URL,
      defaultHeaders: {
        "HTTP-Referer":
          process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
        "X-Title": process.env.NEXT_PUBLIC_APP_NAME ?? "Agency OS",
      },
    });

    try {
      const completion = await client.chat.completions.create(
        {
          model: modelName,
          messages: [
            ...(request.system
              ? [{ role: "system" as const, content: request.system }]
              : []),
            { role: "user", content: request.prompt },
          ],
          response_format: { type: "json_object" },
        },
        { signal: request.signal },
      );

      const text = completion.choices[0]?.message?.content ?? "";
      const usage = {
        promptTokens:
          completion.usage?.prompt_tokens ??
          estimateTokensFromText(request.prompt),
        completionTokens:
          completion.usage?.completion_tokens ?? estimateTokensFromText(text),
        totalTokens:
          completion.usage?.total_tokens ??
          estimateTokensFromText(request.prompt) + estimateTokensFromText(text),
      };

      return {
        ok: true,
        provider: this.id,
        model: modelName,
        text,
        usage,
        latencyMs: Date.now() - started,
        estimatedCostCents: estimateCostCents(this.id, usage),
        raw: completion,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return {
          ok: false,
          provider: this.id,
          model: modelName,
          code: "cancelled",
          message: "Request aborted",
          retryable: false,
          latencyMs: Date.now() - started,
          usage: emptyUsage(),
        };
      }
      const status =
        typeof error === "object" &&
        error &&
        "status" in error &&
        typeof (error as { status: unknown }).status === "number"
          ? (error as { status: number }).status
          : undefined;
      const headers =
        typeof error === "object" && error && "headers" in error
          ? (error as { headers?: Headers }).headers
          : undefined;
      const retryAfter = headers?.get?.("retry-after") ?? null;
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        provider: this.id,
        model: modelName,
        ...mapOpenRouterError(status, message, retryAfter),
        latencyMs: Date.now() - started,
      };
    }
  }
}
