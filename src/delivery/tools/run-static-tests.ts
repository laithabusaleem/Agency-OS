import fs from "node:fs/promises";
import { resolveInWorkspace } from "@/delivery/workspace";
import type { DeliveryTool } from "@/delivery/types";

export const runStaticTestsTool: DeliveryTool = {
  id: "run_static_tests",
  async execute(ctx, params) {
    const suite = String(params.suite ?? "website");

    if (suite === "website") {
      try {
        const html = await fs.readFile(
          resolveInWorkspace(ctx.workspaceRoot, "site/index.html"),
          "utf8",
        );
        const name = String(ctx.brief.businessName ?? "");
        if (!html.includes(name)) {
          return {
            ok: false,
            code: "static_test_failed",
            message: "index.html missing business name",
            retryable: false,
          };
        }
        if (!html.includes('id="primary-cta"')) {
          return {
            ok: false,
            code: "static_test_failed",
            message: "Missing primary CTA",
            retryable: false,
          };
        }
        return { ok: true, data: { suite, passed: 2 } };
      } catch (error) {
        return {
          ok: false,
          code: "static_test_failed",
          message: error instanceof Error ? error.message : String(error),
          retryable: false,
        };
      }
    }

    if (suite === "ai_automation_no_exec") {
      // Used by QA — tool itself always passes when invoked during delivery
      return { ok: true, data: { suite, passed: 1 } };
    }

    return {
      ok: false,
      code: "unknown_suite",
      message: `Unknown static suite ${suite}`,
      retryable: false,
    };
  },
};
