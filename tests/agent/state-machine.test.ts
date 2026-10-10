import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canTransition,
  isTerminalState,
} from "@/agent/state-machine";

describe("agent state machine", () => {
  it("allows the happy path", () => {
    expect(canTransition("pending", "claimed")).toBe(true);
    expect(canTransition("claimed", "running")).toBe(true);
    expect(canTransition("running", "succeeded")).toBe(true);
  });

  it("rejects illegal transitions", () => {
    expect(() => assertTransition("succeeded", "running")).toThrow(/Illegal/);
    expect(isTerminalState("dead_letter")).toBe(true);
  });
});
