import { assertProviderAllowed, getAgentEnv } from "@/agent/config";
import { MissingCredentialsError } from "@/agent/errors";
import { GeminiProvider } from "@/agent/providers/gemini";
import { GroqProvider } from "@/agent/providers/groq";
import { MockProvider } from "@/agent/providers/mock";
import { OpenRouterProvider } from "@/agent/providers/openrouter";
import type { AgentProvider, AgentProviderId } from "@/agent/types";

const providers: Record<AgentProviderId, AgentProvider> = {
  mock: new MockProvider(),
  gemini: new GeminiProvider(),
  groq: new GroqProvider(),
  openrouter: new OpenRouterProvider(),
};

export function getProvider(id: AgentProviderId): AgentProvider {
  const env = getAgentEnv();
  assertProviderAllowed(id, env);

  const provider = providers[id];
  if (!provider) {
    throw new Error(`Unknown provider: ${id}`);
  }

  // Never silently fall back to mock when a real provider is requested.
  if (id !== "mock" && !provider.isConfigured()) {
    throw new MissingCredentialsError(id);
  }

  return provider;
}

export function listProviderStatus() {
  const env = getAgentEnv();
  return (Object.keys(providers) as AgentProviderId[]).map((id) => {
    const provider = providers[id];
    const configured = provider.isConfigured();
    const productionBlocked =
      id === "mock" &&
      env.NODE_ENV === "production" &&
      !env.AGENT_ALLOW_MOCK_IN_PRODUCTION;
    return {
      id,
      name:
        id === "mock"
          ? "Mock (deterministic)"
          : id === "gemini"
            ? "Google Gemini"
            : id === "groq"
              ? "Groq"
              : "OpenRouter",
      configured,
      available: configured && !productionBlocked,
      productionBlocked,
    };
  });
}
