import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getDeliveryEnv } from "@/delivery/config";
import { resolveInWorkspace } from "@/delivery/workspace";

export type PlaywrightSmokeResult =
  | {
      ok: true;
      title: string;
      hasCta: boolean;
      bodyText: string;
      engine: "playwright" | "static_fallback";
    }
  | {
      ok: false;
      message: string;
      engine: "playwright" | "static_fallback" | "none";
    };

/**
 * Browser smoke check for static HTML artifacts.
 * Uses Playwright when DELIVERY_PLAYWRIGHT_ENABLED=true and browsers are available;
 * otherwise falls back to deterministic static HTML parsing (still independent of model claims).
 */
export async function runPlaywrightSmoke(input: {
  workspaceRoot: string;
  relativePath: string;
  expectText?: string;
}): Promise<PlaywrightSmokeResult> {
  const env = getDeliveryEnv();
  const full = resolveInWorkspace(input.workspaceRoot, input.relativePath);

  if (env.DELIVERY_PLAYWRIGHT_ENABLED) {
    try {
      const { chromium } = await import("playwright");
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        await page.goto(pathToFileURL(full).href, { waitUntil: "load" });
        const title = await page.title();
        const hasCta = (await page.locator("#primary-cta").count()) > 0;
        const bodyText = (await page.locator("body").innerText()).slice(
          0,
          2000,
        );
        if (input.expectText && !bodyText.includes(input.expectText)) {
          return {
            ok: false,
            message: `Playwright: expected text not found: ${input.expectText}`,
            engine: "playwright",
          };
        }
        if (!hasCta) {
          return {
            ok: false,
            message: "Playwright: #primary-cta missing",
            engine: "playwright",
          };
        }
        return { ok: true, title, hasCta, bodyText, engine: "playwright" };
      } finally {
        await browser.close();
      }
    } catch (error) {
      // Fall through to static if browsers not installed
      const message = error instanceof Error ? error.message : String(error);
      if (!/Executable doesn't exist|browserType\.launch/i.test(message)) {
        return {
          ok: false,
          message: `Playwright error: ${message}`,
          engine: "playwright",
        };
      }
    }
  }

  // Deterministic static fallback — still checks real file contents
  try {
    const html = await fs.readFile(full, "utf8");
    const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
    const title = titleMatch?.[1] ?? "";
    const hasCta = html.includes('id="primary-cta"');
    const bodyText = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    if (input.expectText && !bodyText.includes(input.expectText)) {
      return {
        ok: false,
        message: `Static fallback: expected text not found: ${input.expectText}`,
        engine: "static_fallback",
      };
    }
    if (!hasCta) {
      return {
        ok: false,
        message: "Static fallback: #primary-cta missing",
        engine: "static_fallback",
      };
    }
    return {
      ok: true,
      title,
      hasCta,
      bodyText: bodyText.slice(0, 2000),
      engine: "static_fallback",
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      engine: "none",
    };
  }
}

export function playwrightReportPath(workspaceRoot: string) {
  return path.join(workspaceRoot, "qa", "playwright-smoke.json");
}
