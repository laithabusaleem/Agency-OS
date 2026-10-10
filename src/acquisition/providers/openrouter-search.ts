import { getAgentEnv } from "@/agent/config";
import type {
  ResearchProvider,
  ResearchSearchInput,
} from "@/acquisition/providers/types";
import type { SearchHit } from "@/acquisition/types";

type Annotation = {
  type?: string;
  url?: string;
  url_citation?: {
    url?: string;
    title?: string;
    content?: string;
  };
};

/**
 * Live web research via OpenRouter web search.
 * Only returns hits with real https URLs from citations — never invents contacts.
 */
export class OpenRouterSearchProvider implements ResearchProvider {
  readonly id = "openrouter" as const;

  isConfigured() {
    return Boolean(getAgentEnv().OPENROUTER_API_KEY);
  }

  async search(input: ResearchSearchInput): Promise<SearchHit[]> {
    const env = getAgentEnv();
    if (!env.OPENROUTER_API_KEY) {
      throw new Error(
        "OpenRouter search is not configured. Set OPENROUTER_API_KEY.",
      );
    }

    const q = [input.query, input.market, input.niche]
      .filter(Boolean)
      .join(" ");
    const count = Math.min(10, Math.max(3, input.count ?? 5));
    const retrievedAt = new Date().toISOString();

    const body = {
      model: env.OPENROUTER_MODEL,
      temperature: 0,
      tools: [
        {
          type: "openrouter:web_search",
          max_results: count,
        },
      ],
      // Deprecated plugin kept as compatibility fallback for some models
      plugins: [{ id: "web", max_results: count }],
      messages: [
        {
          role: "system",
          content:
            "You are a B2B prospecting researcher. Use web search. List real businesses matching the query. For each business include only a public website URL you actually retrieved from search. Never invent companies, emails, or phone numbers. Prefer company homepages over directories when possible.",
        },
        {
          role: "user",
          content: `Find up to ${count} real businesses for: ${q}

Return a short markdown bullet list. Each bullet MUST include the company name and a full https URL as a markdown link. Example:
- [Acme Studio](https://acme.example) — branding agency in Austin`,
        },
      ],
    };

    const res = await fetch(`${env.OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "Agency OS Lead Acquisition",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });

    if (res.status === 401 || res.status === 403) {
      throw new Error("OpenRouter credentials rejected");
    }
    if (res.status === 429) {
      throw new Error("OpenRouter rate limited — try again shortly");
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `OpenRouter search failed (${res.status})${text ? `: ${text.slice(0, 200)}` : ""}`,
      );
    }

    const payload = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          annotations?: Annotation[];
        };
      }>;
    };

    const message = payload.choices?.[0]?.message;
    const hits = parseOpenRouterSearchHits({
      content: message?.content ?? "",
      annotations: message?.annotations ?? [],
      retrievedAt,
    });

    if (!hits.length) {
      throw new Error(
        "OpenRouter web search returned no cited URLs (fail closed — no fabricated leads)",
      );
    }
    return hits.slice(0, count);
  }
}

/** Exported for tests — only accepts http(s) URLs from citations or markdown links. */
export function parseOpenRouterSearchHits(input: {
  content: string;
  annotations: Annotation[];
  retrievedAt: string;
}): SearchHit[] {
  const byUrl = new Map<string, SearchHit>();

  for (const ann of input.annotations) {
    const url =
      (ann.url_citation?.url || ann.url || "").trim() ||
      (ann.type === "url_citation" && typeof (ann as { url?: string }).url === "string"
        ? (ann as { url: string }).url
        : "");
    const citation = ann.url_citation;
    const resolved = (citation?.url || url).trim();
    if (!isHttpUrl(resolved)) continue;
    const title =
      citation?.title?.trim() ||
      titleFromMarkdown(input.content, resolved) ||
      hostnameTitle(resolved);
    byUrl.set(resolved, {
      title,
      url: resolved,
      description: (citation?.content || "").trim().slice(0, 500),
      provider: "openrouter",
      retrievedAt: input.retrievedAt,
    });
  }

  for (const match of input.content.matchAll(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
  )) {
    const title = match[1]?.trim() || "";
    const url = match[2]?.trim() || "";
    if (!isHttpUrl(url)) continue;
    const existing = byUrl.get(url);
    if (existing) {
      if (title && existing.title === hostnameTitle(url)) {
        existing.title = title;
      }
      continue;
    }
    byUrl.set(url, {
      title: title || hostnameTitle(url),
      url,
      description: surroundingLine(input.content, url),
      provider: "openrouter",
      retrievedAt: input.retrievedAt,
    });
  }

  // Drop known non-business noise hosts when better options exist
  const hits = [...byUrl.values()].filter(
    (h) => !isLowValueHost(h.url) || byUrl.size <= 2,
  );
  return hits;
}

function isHttpUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

function hostnameTitle(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function titleFromMarkdown(content: string, url: string) {
  const re = new RegExp(
    `\\[([^\\]]+)\\]\\(${url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`,
  );
  return content.match(re)?.[1]?.trim() || "";
}

function surroundingLine(content: string, url: string) {
  const line = content.split(/\r?\n/).find((l) => l.includes(url));
  return (line || "").replace(url, "").replace(/[\[\]()*-]/g, " ").trim().slice(0, 500);
}

function isLowValueHost(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return /(wikipedia\.org|facebook\.com|linkedin\.com|twitter\.com|x\.com|instagram\.com|youtube\.com|tiktok\.com)$/.test(
      host.replace(/^www\./, ""),
    );
  } catch {
    return false;
  }
}
