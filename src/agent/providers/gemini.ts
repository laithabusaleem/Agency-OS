import { GoogleGenerativeAI } from "@google/generative-ai";
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

function mapGeminiError(
  error: unknown,
): Pick<
  Extract<ProviderResult, { ok: false }>,
  "code" | "message" | "retryable" | "retryAfterMs"
> {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  const retryAfterMatch = message.match(/retry[- ]after[:\s]+(\d+)/i);
  const retryAfterMs = retryAfterMatch
    ? Number(retryAfterMatch[1]) * 1000
    : undefined;

  if (lower.includes("429") || lower.includes("rate")) {
    return {
      code: "rate_limited",
      message,
      retryable: true,
      retryAfterMs,
    };
  }
  if (lower.includes("quota") || lower.includes("resource_exhausted")) {
    return { code: "quota_exhausted", message, retryable: false };
  }
  if (
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes("api key")
  ) {
    return { code: "missing_credentials", message, retryable: false };
  }
  if (
    lower.includes("503") ||
    lower.includes("500") ||
    lower.includes("unavailable")
  ) {
    return { code: "provider_outage", message, retryable: true };
  }
  return { code: "unknown", message, retryable: true };
}

async function withSignal<T>(promise: Promise<T>, signal?: AbortSignal) {
  if (!signal) return promise;
  if (signal.aborted) {
    throw Object.assign(new Error("Aborted"), { name: "AbortError" });
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

export class GeminiProvider implements AgentProvider {
  readonly id = "gemini" as const;

  isConfigured() {
    return Boolean(getAgentEnv().GEMINI_API_KEY);
  }

  async complete(request: ProviderRequest): Promise<ProviderResult> {
    const env = getAgentEnv();
    if (!env.GEMINI_API_KEY) {
      throw new MissingCredentialsError(this.id);
    }

    const started = Date.now();
    const modelName = request.model || env.GEMINI_MODEL;

    try {
      const client = new GoogleGenerativeAI(env.GEMINI_API_KEY);
      const model = client.getGenerativeModel({
        model: modelName,
        systemInstruction: request.system,
      });

      const result = await withSignal(
        model.generateContent({
          contents: [{ role: "user", parts: [{ text: request.prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
        request.signal,
      );

      const text = result.response.text();
      const usageMeta = result.response.usageMetadata;
      const usage = {
        promptTokens:
          usageMeta?.promptTokenCount ?? estimateTokensFromText(request.prompt),
        completionTokens:
          usageMeta?.candidatesTokenCount ?? estimateTokensFromText(text),
        totalTokens:
          usageMeta?.totalTokenCount ??
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
        raw: result.response,
      };
    } catch (error) {
      if (error instanceof MissingCredentialsError) throw error;
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
      const mapped = mapGeminiError(error);
      return {
        ok: false,
        provider: this.id,
        model: modelName,
        ...mapped,
        latencyMs: Date.now() - started,
      };
    }
  }
}
