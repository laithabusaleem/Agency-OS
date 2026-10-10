import {
  emptyUsage,
  estimateCostCents,
  estimateTokensFromText,
} from "@/agent/costing";
import type {
  AgentProvider,
  ProviderRequest,
  ProviderResult,
  StructuredAgentOutput,
} from "@/agent/types";

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
      return;
    }
    const timer = setTimeout(() => resolve(), ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
      },
      { once: true },
    );
  });
}

function deterministicOutput(request: ProviderRequest): StructuredAgentOutput {
  const text = request.prompt;
  switch (request.agentType) {
    case "summarize_text":
      return {
        agentType: "summarize_text",
        summary: `Mock summary (${text.slice(0, 48)})`,
        data: {
          bulletPoints: ["Point A", "Point B", "Point C"],
          sentiment: text.toLowerCase().includes("bad")
            ? "negative"
            : "neutral",
        },
      };
    case "draft_outreach":
      return {
        agentType: "draft_outreach",
        summary: "Mock outreach draft",
        data: {
          subject: "Quick idea for your team",
          body: `Hello — regarding: ${text.slice(0, 80)}`,
          cta: "Book a 15-minute chat",
        },
      };
    case "extract_entities":
      return {
        agentType: "extract_entities",
        summary: "Mock entity extraction",
        data: {
          people: text.includes("Ada") ? ["Ada Lovelace"] : [],
          companies: text.includes("Acme") ? ["Acme"] : ["Demo Co"],
          emails: (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ??
            []) as string[],
        },
      };
    case "research_decision_maker":
      return {
        agentType: "research_decision_maker",
        summary: "Mock DMI research placeholder",
        data: {
          candidateIds: [],
          limitation: "Use worker DMI pipeline path in production jobs",
          runId: "mock",
          cached: false,
        },
      };
  }
}

/**
 * Deterministic mock provider for tests and local development.
 * Special prompt tokens drive failure modes — never used as a silent production fallback.
 */
export class MockProvider implements AgentProvider {
  readonly id = "mock" as const;

  isConfigured() {
    return true;
  }

  async complete(request: ProviderRequest): Promise<ProviderResult> {
    const started = Date.now();
    const prompt = request.prompt;

    try {
      if (prompt.includes("__MISSING_CREDENTIALS__")) {
        return {
          ok: false,
          provider: this.id,
          model: request.model,
          code: "missing_credentials",
          message: "Simulated missing credentials",
          retryable: false,
          latencyMs: Date.now() - started,
        };
      }

      if (prompt.includes("__FAIL_QUOTA__")) {
        return {
          ok: false,
          provider: this.id,
          model: request.model,
          code: "quota_exhausted",
          message: "Simulated quota exhaustion",
          retryable: false,
          latencyMs: Date.now() - started,
        };
      }

      if (prompt.includes("__FAIL_RATE_LIMIT__")) {
        return {
          ok: false,
          provider: this.id,
          model: request.model,
          code: "rate_limited",
          message: "Simulated rate limit",
          retryable: true,
          retryAfterMs: 1200,
          latencyMs: Date.now() - started,
        };
      }

      if (prompt.includes("__PROVIDER_OUTAGE__")) {
        return {
          ok: false,
          provider: this.id,
          model: request.model,
          code: "provider_outage",
          message: "Simulated provider outage",
          retryable: true,
          latencyMs: Date.now() - started,
        };
      }

      if (prompt.includes("__FAIL_ONCE__") && request.attempt === 1) {
        return {
          ok: false,
          provider: this.id,
          model: request.model,
          code: "provider_outage",
          message: "Simulated transient failure on first attempt",
          retryable: true,
          latencyMs: Date.now() - started,
        };
      }

      if (prompt.includes("__CRASH__")) {
        throw new Error("Simulated worker crash");
      }

      if (prompt.includes("__TIMEOUT__")) {
        await sleep(request.signal ? 60_000 : 5_000, request.signal);
      } else {
        await sleep(5, request.signal);
      }

      const output = deterministicOutput(request);
      const text = JSON.stringify(output);
      const promptTokens = estimateTokensFromText(request.prompt);
      const completionTokens = estimateTokensFromText(text);
      const usage = {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      };

      return {
        ok: true,
        provider: this.id,
        model: request.model,
        text,
        usage,
        latencyMs: Date.now() - started,
        estimatedCostCents: estimateCostCents(this.id, usage),
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return {
          ok: false,
          provider: this.id,
          model: request.model,
          code: "cancelled",
          message: "Request aborted",
          retryable: false,
          latencyMs: Date.now() - started,
          usage: emptyUsage(),
        };
      }
      throw error;
    }
  }
}
