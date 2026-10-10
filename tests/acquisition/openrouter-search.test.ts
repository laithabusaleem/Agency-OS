import { describe, expect, it } from "vitest";
import { parseOpenRouterSearchHits } from "@/acquisition/providers/openrouter-search";

describe("openrouter search parse", () => {
  it("accepts citation URLs and markdown links", () => {
    const hits = parseOpenRouterSearchHits({
      retrievedAt: "2026-01-01T00:00:00.000Z",
      annotations: [
        {
          type: "url_citation",
          url_citation: {
            url: "https://northstar.example/about",
            title: "Northstar Studio",
            content: "Brand studio in Austin",
          },
        },
      ],
      content:
        "- [Northstar Studio](https://northstar.example/about) — branding\n- [Other Co](https://other.example)",
    });
    expect(hits.some((h) => h.url.includes("northstar.example"))).toBe(true);
    expect(hits.some((h) => h.url.includes("other.example"))).toBe(true);
    expect(hits.every((h) => h.provider === "openrouter")).toBe(true);
  });

  it("returns empty when no URLs are cited (fail closed)", () => {
    const hits = parseOpenRouterSearchHits({
      retrievedAt: "2026-01-01T00:00:00.000Z",
      annotations: [],
      content: "I found Acme and Beta but will not invent URLs.",
    });
    expect(hits).toHaveLength(0);
  });
});
