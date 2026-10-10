import { isAllowedByRobots } from "@/acquisition/fetch/robots";
import { sanitizeRetrievedText } from "@/acquisition/sanitize";
import type { FetchOutcome } from "@/acquisition/types";
import { assertSafePublicUrl } from "@/lib/security/ssrf";

const USER_AGENT =
  "AgencyOSBot/1.0 (+https://localhost; respectful research; respects robots.txt)";

const domainLastFetch = new Map<string, number>();
const MIN_GAP_MS = 1_000;

const CAPTCHA_HINTS = [
  "captcha",
  "cf-challenge",
  "hcaptcha",
  "recaptcha",
  "verify you are human",
  "attention required",
];

const LOGIN_HINTS = [
  "sign in to continue",
  "log in to continue",
  "auth0",
  "/login?",
  "accounts.google.com",
  "please log in",
];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch publicly accessible pages only.
 * Does not bypass CAPTCHAs, logins, or access blocks.
 */
export async function fetchPublicPage(
  targetUrl: string,
  opts?: {
    fetchImpl?: typeof fetch;
    maxBytes?: number;
  },
): Promise<FetchOutcome> {
  const retrievedAt = new Date().toISOString();
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const maxBytes = opts?.maxBytes ?? 500_000;

  let url: URL;
  try {
    url = await assertSafePublicUrl(targetUrl);
  } catch (error) {
    return {
      ok: false,
      url: targetUrl,
      reason: "unsupported",
      message:
        error instanceof Error
          ? error.message
          : "URL blocked by SSRF protections",
      retrievedAt,
    };
  }

  const robots = await isAllowedByRobots(url.toString(), {
    userAgent: USER_AGENT,
    fetchImpl,
  });
  if (!robots.allowed) {
    return {
      ok: false,
      url: targetUrl,
      reason: "robots_disallow",
      message: "Blocked by robots.txt",
      retrievedAt,
    };
  }

  const host = url.hostname;
  const last = domainLastFetch.get(host) ?? 0;
  const wait = Math.max(MIN_GAP_MS, robots.crawlDelayMs) - (Date.now() - last);
  if (wait > 0) await sleep(wait);

  try {
    // Do not auto-follow redirects — re-validate each hop against SSRF rules.
    let current = url;
    let res: Response | null = null;
    for (let hop = 0; hop < 5; hop++) {
      res = await fetchImpl(current.toString(), {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) {
          return {
            ok: false,
            url: targetUrl,
            reason: "blocked",
            message: "Redirect without Location header",
            status: res.status,
            retrievedAt,
          };
        }
        const next = new URL(location, current);
        try {
          current = await assertSafePublicUrl(next.toString());
        } catch (error) {
          return {
            ok: false,
            url: targetUrl,
            reason: "unsupported",
            message:
              error instanceof Error
                ? `Redirect blocked: ${error.message}`
                : "Redirect blocked by SSRF protections",
            status: res.status,
            retrievedAt,
          };
        }
        continue;
      }
      break;
    }
    if (!res) {
      return {
        ok: false,
        url: targetUrl,
        reason: "network",
        message: "Empty fetch response",
        retrievedAt,
      };
    }
    domainLastFetch.set(host, Date.now());

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        url: targetUrl,
        reason: "blocked",
        message: `Access blocked (${res.status})`,
        status: res.status,
        retrievedAt,
      };
    }
    if (res.status === 429) {
      return {
        ok: false,
        url: targetUrl,
        reason: "rate_limited",
        message: "Rate limited by site",
        status: 429,
        retrievedAt,
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        url: targetUrl,
        reason: "blocked",
        message: `HTTP ${res.status}`,
        status: res.status,
        retrievedAt,
      };
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (
      !contentType.includes("text/") &&
      !contentType.includes("json") &&
      !contentType.includes("html")
    ) {
      return {
        ok: false,
        url: targetUrl,
        reason: "unsupported",
        message: `Unsupported content-type: ${contentType}`,
        status: res.status,
        retrievedAt,
      };
    }

    const buf = new Uint8Array(await res.arrayBuffer());
    const sliced = buf.byteLength > maxBytes ? buf.slice(0, maxBytes) : buf;
    const text = new TextDecoder("utf-8", { fatal: false }).decode(sliced);
    const lower = text.toLowerCase();

    if (CAPTCHA_HINTS.some((h) => lower.includes(h))) {
      return {
        ok: false,
        url: targetUrl,
        reason: "captcha",
        message: "CAPTCHA / bot-challenge detected — not bypassed",
        status: res.status,
        retrievedAt,
      };
    }
    if (
      LOGIN_HINTS.some((h) => lower.includes(h)) &&
      lower.includes("password")
    ) {
      return {
        ok: false,
        url: targetUrl,
        reason: "login_wall",
        message: "Login wall detected — not bypassed",
        status: res.status,
        retrievedAt,
      };
    }

    return {
      ok: true,
      url: targetUrl,
      finalUrl: res.url || current.toString(),
      status: res.status,
      contentType,
      text: sanitizeRetrievedText(text, 20_000),
      retrievedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const reason = message.toLowerCase().includes("timeout")
      ? "timeout"
      : "network";
    return {
      ok: false,
      url: targetUrl,
      reason,
      message,
      retrievedAt,
    };
  }
}

export function resetFetchRateLimits() {
  domainLastFetch.clear();
}
