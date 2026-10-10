type RobotsRules = {
  fetchedAt: number;
  disallow: string[];
  crawlDelayMs: number;
};

const cache = new Map<string, RobotsRules>();
const CACHE_TTL_MS = 60 * 60 * 1000;

function matchPath(pathname: string, pattern: string) {
  if (pattern === "/") return true;
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}`).test(pathname);
}

export async function isAllowedByRobots(
  targetUrl: string,
  opts?: {
    userAgent?: string;
    fetchImpl?: typeof fetch;
  },
): Promise<{ allowed: boolean; crawlDelayMs: number; reason?: string }> {
  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch {
    return { allowed: false, crawlDelayMs: 0, reason: "invalid_url" };
  }

  const origin = url.origin;
  const now = Date.now();
  let rules = cache.get(origin);
  if (!rules || now - rules.fetchedAt > CACHE_TTL_MS) {
    const fetchImpl = opts?.fetchImpl ?? fetch;
    try {
      const res = await fetchImpl(`${origin}/robots.txt`, {
        headers: {
          "User-Agent":
            opts?.userAgent ?? "AgencyOSBot/1.0 (+research; respectful)",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) {
        // No robots or inaccessible — allow with conservative delay (common practice for public pages)
        rules = { fetchedAt: now, disallow: [], crawlDelayMs: 1_000 };
      } else {
        const body = await res.text();
        rules = parseRobotsTxt(body, opts?.userAgent ?? "AgencyOSBot");
        rules.fetchedAt = now;
      }
      cache.set(origin, rules);
    } catch {
      rules = { fetchedAt: now, disallow: [], crawlDelayMs: 1_500 };
      cache.set(origin, rules);
    }
  }

  const blocked = rules.disallow.some((pattern) =>
    matchPath(url.pathname || "/", pattern),
  );
  if (blocked) {
    return {
      allowed: false,
      crawlDelayMs: rules.crawlDelayMs,
      reason: "robots_disallow",
    };
  }
  return { allowed: true, crawlDelayMs: rules.crawlDelayMs };
}

export function parseRobotsTxt(body: string, userAgent: string): RobotsRules {
  const lines = body.split(/\r?\n/);
  let inRelevant = false;
  let sawAgent = false;
  const disallow: string[] = [];
  let crawlDelayMs = 1_000;

  for (const raw of lines) {
    const line = raw.split("#")[0]?.trim() ?? "";
    if (!line) continue;
    const [keyRaw, ...rest] = line.split(":");
    const key = keyRaw?.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      const agent = value.toLowerCase();
      inRelevant =
        agent === "*" ||
        userAgent.toLowerCase().includes(agent) ||
        agent.includes("agencyosbot");
      sawAgent = sawAgent || inRelevant;
      continue;
    }
    if (!inRelevant) continue;
    if (key === "disallow" && value) disallow.push(value);
    if (key === "crawl-delay") {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) {
        crawlDelayMs = Math.min(30_000, Math.max(0, seconds * 1000));
      }
    }
  }

  // If file had agents but none matched, default allow with delay.
  void sawAgent;
  return { fetchedAt: Date.now(), disallow, crawlDelayMs };
}

export function clearRobotsCache() {
  cache.clear();
}
