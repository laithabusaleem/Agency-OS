import Groq from "groq-sdk";
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

function mapHttpError(
  status: number | undefined,
  message: string,
  headers?: Headers | Record<string, string> | null,
): Pick<
  Extract<ProviderResult, { ok: false }>,
  "code" | "message" | "retryable" | "retryAfterMs"
> {
  let retryAfterRaw: string | undefined;
  if (headers && typeof (headers as Headers).get === "function") {
    retryAfterRaw = (headers as Headers).get("retry-after") ?? undefined;
  } else if (headers && typeof headers === "object") {
    const record = headers as Record<string, string>;
    retryAfterRaw = record["retry-after"] ?? record["Retry-After"];
  }
  const retryAfterMs = retryAfterRaw
    ? Number(retryAfterRaw) * (String(retryAfterRaw).includes(":") ? 1 : 1000)
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
  if (status === 402 || message.toLowerCase().includes("quota")) {
    return { code: "quota_exhausted", message, retryable: false };
  }
  if (status && status >= 500) {
    return { code: "provider_outage", message, retryable: true };
  }
  return { code: "unknown", message, retryable: true };
}

export class GroqProvider implements AgentProvider {
  readonly id = "groq" as const;

  isConfigured() {
    return Boolean(getAgentEnv().GROQ_API_KEY);
  }

  async complete(request: ProviderRequest): Promise<ProviderResult> {
    const env = getAgentEnv();
    if (!env.GROQ_API_KEY) {
      throw new MissingCredentialsError(this.id);
    }

    const started = Date.now();
    const modelName = request.model || env.GROQ_MODEL;
    const client = new Groq({ apiKey: env.GROQ_API_KEY });

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
          ? ((error as { headers: Headers | Record<string, string> }).headers ??
            null)
          : null;
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        provider: this.id,
        model: modelName,
        ...mapHttpError(status, message, headers),
        latencyMs: Date.now() - started,
      };
    }
  }
}
