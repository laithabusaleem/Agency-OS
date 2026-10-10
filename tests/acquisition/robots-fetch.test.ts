import { describe, expect, it } from "vitest";
import {
  clearRobotsCache,
  parseRobotsTxt,
  isAllowedByRobots,
} from "@/acquisition/fetch/robots";
import {
  fetchPublicPage,
  resetFetchRateLimits,
} from "@/acquisition/fetch/public-fetch";

describe("robots and public fetch", () => {
  it("parses disallow rules", () => {
    const rules = parseRobotsTxt(
      `User-agent: *\nDisallow: /private\nCrawl-delay: 2\n`,
      "AgencyOSBot",
    );
    expect(rules.disallow).toContain("/private");
    expect(rules.crawlDelayMs).toBe(2000);
  });

  it("blocks robots-disallowed paths", async () => {
    clearRobotsCache();
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) {
        return new Response("User-agent: *\nDisallow: /secret\n", {
          status: 200,
        });
      }
      return new Response("should not fetch", { status: 200 });
    };
    const result = await isAllowedByRobots("https://example.com/secret/page", {
      fetchImpl,
    });
    expect(result.allowed).toBe(false);
  });

  it("does not bypass captcha pages", async () => {
    resetFetchRateLimits();
    clearRobotsCache();
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) {
        return new Response("User-agent: *\nDisallow:\n", { status: 200 });
      }
      return new Response(
        "<html>Please complete the captcha to continue</html>",
        {
          status: 200,
          headers: { "content-type": "text/html" },
        },
      );
    };
    const page = await fetchPublicPage("https://blocked.example/", {
      fetchImpl,
    });
    expect(page.ok).toBe(false);
    if (!page.ok) expect(page.reason).toBe("captcha");
  });
});
