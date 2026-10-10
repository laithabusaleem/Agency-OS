import { describe, expect, it } from "vitest";
import { parseBraveResults } from "@/acquisition/providers/brave";

describe("brave malformed results", () => {
  it("returns empty for non-object payloads", () => {
    expect(parseBraveResults(null)).toEqual([]);
    expect(parseBraveResults("nope")).toEqual([]);
    expect(parseBraveResults({ web: { results: null } })).toEqual([]);
  });

  it("skips invalid URLs and does not invent contacts", () => {
    const hits = parseBraveResults({
      web: {
        results: [
          { title: "Ok", url: "https://ok.example", description: "hi" },
          { title: "Bad", url: "javascript:alert(1)", description: "x" },
          { title: "Missing url", description: "y" },
          null,
          42,
        ],
      },
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.url).toBe("https://ok.example");
  });
});
