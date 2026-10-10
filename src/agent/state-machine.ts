import type { JobState } from "@/agent/types";

/**
 * Explicit workflow state machine for agent jobs.
 * Illegal transitions throw — never mutate status ad hoc.
 */
const TRANSITIONS: Record<JobState, readonly JobState[]> = {
  pending: ["claimed", "cancelled"],
  claimed: ["running", "cancelled", "pending"],
  running: [
    "succeeded",
    "failed",
    "retry_wait",
    "cancelled",
    "timed_out",
    "dead_letter",
    // Crash recovery when worker lock expires mid-run.
    "pending",
  ],
  retry_wait: ["claimed", "cancelled", "dead_letter"],
  failed: ["retry_wait", "dead_letter"],
  succeeded: [],
  cancelled: [],
  dead_letter: [],
  timed_out: ["dead_letter"],
};

export function canTransition(from: JobState, to: JobState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: JobState, to: JobState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal job transition: ${from} -> ${to}`);
  }
}

export function isTerminalState(state: JobState): boolean {
  return TRANSITIONS[state].length === 0;
}

export function isClaimableState(state: JobState): boolean {
  return state === "pending" || state === "retry_wait";
}
