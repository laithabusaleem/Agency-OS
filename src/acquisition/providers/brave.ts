import { getAcquisitionEnv } from "@/acquisition/config";
import type {
  ResearchProvider,
  ResearchSearchInput,
} from "@/acquisition/providers/types";
import type { SearchHit } from "@/acquisition/types";

/**
 * Brave Web Search API adapter.
 * Docs: https://api.search.brave.com/res/v1/web/search
 * Auth header: X-Subscription-Token
 */
export class BraveSearchProvider implements ResearchProvider {
  readonly id = "brave" as const;

  isConfigured() {
    return Boolean(getAcquisitionEnv().BRAVE_SEARCH_API_KEY);
  }

  async search(input: ResearchSearchInput): Promise<SearchHit[]> {
    const env = getAcquisitionEnv();
    if (!env.BRAVE_SEARCH_API_KEY) {
      throw new Error(
        "Brave Search is not configured. Set BRAVE_SEARCH_API_KEY or use manual/CSV import.",
      );
    }

    const q = [input.query, input.market, input.niche]
      .filter(Boolean)
      .join(" ");
    const url = new URL(env.BRAVE_SEARCH_BASE_URL);
    url.searchParams.set("q", q);
    url.searchParams.set("count", String(Math.min(20, input.count ?? 5)));

    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": env.BRAVE_SEARCH_API_KEY,
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (res.status === 429) {
      const retryAfter = res.headers.get("retry-after");
      throw new Error(
        `Brave Search rate limited${retryAfter ? ` (Retry-After: ${retryAfter})` : ""}`,
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error("Brave Search credentials rejected");
    }
    if (!res.ok) {
      throw new Error(`Brave Search request failed (${res.status})`);
    }

    const payload = (await res.json()) as unknown;
    return parseBraveResults(payload);
  }
}

/** Exported for tests — tolerates malformed payloads without inventing contacts. */
export function parseBraveResults(payload: unknown): SearchHit[] {
  if (!payload || typeof payload !== "object") return [];
  const web = (payload as { web?: { results?: unknown } }).web;
  const results = web?.results;
  if (!Array.isArray(results)) return [];

  const retrievedAt = new Date().toISOString();
  const hits: SearchHit[] = [];
  for (const item of results) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const url = typeof row.url === "string" ? row.url : "";
    const title = typeof row.title === "string" ? row.title : "";
    const description =
      typeof row.description === "string"
        ? row.description
        : typeof row.snippet === "string"
          ? row.snippet
          : "";
    if (!url || !/^https?:\/\//i.test(url)) continue;
    hits.push({
      title: title || url,
      url,
      description,
      provider: "brave",
      retrievedAt,
    });
  }
  return hits;
}
