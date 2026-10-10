import { describe, expect, it } from "vitest";
import { cn, formatDate } from "@/lib/utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});

describe("formatDate", () => {
  it("formats valid dates", () => {
    expect(formatDate("2026-01-15")).toMatch(/2026/);
  });

  it("handles empty values", () => {
    expect(formatDate(null)).toBe("—");
  });
});
