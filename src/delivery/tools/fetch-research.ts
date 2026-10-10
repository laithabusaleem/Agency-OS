import { getDeliveryEnv } from "@/delivery/config";
import { getFixture } from "@/delivery/fixtures";
import type { DeliveryTool } from "@/delivery/types";

type Source = { title: string; url: string; snippet: string };

/**
 * Mock mode → fixture sources.
 * Live mode → Brave Search when BRAVE_SEARCH_API_KEY is configured; otherwise fail closed.
 */
export const fetchResearchTool: DeliveryTool = {
  id: "fetch_research",
  async execute(ctx) {
    if (ctx.mode === "mock") {
      const fixture = getFixture("research_base");
      const sources = (fixture.sources as Source[]) ?? [];
      ctx.bag.research = { provider: "fixture", sources };
      return {
        ok: true,
        data: { provider: "fixture", count: sources.length },
      };
    }

    const env = getDeliveryEnv();
    if (!env.BRAVE_SEARCH_API_KEY) {
      return {
        ok: false,
        code: "missing_credentials",
        message:
          "Live business_research requires BRAVE_SEARCH_API_KEY (fail closed)",
        retryable: false,
      };
    }

    try {
      const query = `${ctx.brief.topic} ${ctx.brief.market}`;
      const url = new URL("https://api.search.brave.com/res/v1/web/search");
      url.searchParams.set("q", String(query));
      url.searchParams.set("count", "5");

      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": env.BRAVE_SEARCH_API_KEY,
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        return {
          ok: false,
          code: "provider_error",
          message: `Brave HTTP ${res.status}`,
          retryable: res.status >= 500,
        };
      }

      const payload = (await res.json()) as {
        web?: {
          results?: Array<{
            title?: string;
            url?: string;
            description?: string;
          }>;
        };
      };
      const sources: Source[] = (payload.web?.results ?? []).map((r) => ({
        title: r.title ?? "Untitled",
        url: r.url ?? "",
        snippet: r.description ?? "",
      }));

      ctx.bag.research = { provider: "brave", sources };
      return {
        ok: true,
        data: { provider: "brave", count: sources.length },
      };
    } catch (error) {
      return {
        ok: false,
        code: "network",
        message: error instanceof Error ? error.message : String(error),
        retryable: true,
      };
    }
  },
};
