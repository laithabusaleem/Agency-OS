import path from "node:path";
import { workspaceFileExists } from "@/delivery/workspace";
import type { DeliveryTool } from "@/delivery/types";
import fs from "node:fs/promises";
import { resolveInWorkspace } from "@/delivery/workspace";

export const checkLinksTool: DeliveryTool = {
  id: "check_links",
  async execute(ctx, params) {
    const relativePath = String(
      params.relativePath ??
        (params.key === "site_index" ? "site/index.html" : "site/index.html"),
    );
    const full = resolveInWorkspace(ctx.workspaceRoot, relativePath);
    let html: string;
    try {
      html = await fs.readFile(full, "utf8");
    } catch {
      return {
        ok: false,
        code: "missing_file",
        message: `Cannot check links; missing ${relativePath}`,
        retryable: false,
      };
    }

    const hrefs = [...html.matchAll(/href=["']([^"']+)["']/g)].map(
      (m) => m[1]!,
    );
    const broken: string[] = [];
    for (const href of hrefs) {
      if (
        href.startsWith("#") ||
        href.startsWith("http") ||
        href.startsWith("mailto:")
      ) {
        continue;
      }
      const target = path.posix.normalize(
        path.posix.join(
          path.posix.dirname(relativePath.split(path.sep).join("/")),
          href,
        ),
      );
      const exists = await workspaceFileExists(ctx.workspaceRoot, target);
      if (!exists) broken.push(href);
    }

    if (broken.length) {
      return {
        ok: false,
        code: "broken_links",
        message: `Broken local links: ${broken.join(", ")}`,
        retryable: false,
      };
    }

    return {
      ok: true,
      data: { checked: hrefs.length, broken: [] },
    };
  },
};
