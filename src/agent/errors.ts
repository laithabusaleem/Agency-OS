import type { ProviderFailureCode } from "@/agent/types";

export class AgentRuntimeError extends Error {
  constructor(
    message: string,
    readonly code:
      | ProviderFailureCode
      | "kill_switch"
      | "budget"
      | "idempotency"
      | "not_found",
    readonly retryable = false,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "AgentRuntimeError";
  }
}

export class MissingCredentialsError extends AgentRuntimeError {
  constructor(provider: string) {
    super(
      `Provider "${provider}" is missing required credentials`,
      "missing_credentials",
      false,
    );
    this.name = "MissingCredentialsError";
  }
}

export class KillSwitchError extends AgentRuntimeError {
  constructor() {
    super("Agent runtime kill switch is enabled", "kill_switch", false);
    this.name = "KillSwitchError";
  }
}

export class BudgetExceededError extends AgentRuntimeError {
  constructor(scope: "job" | "global") {
    super(`Agent ${scope} budget exceeded`, "budget", false);
    this.name = "BudgetExceededError";
  }
}
