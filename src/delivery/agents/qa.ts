import fs from "node:fs/promises";
import { runPlaywrightSmoke } from "@/delivery/playwright-qa";
import { validateBrief } from "@/delivery/templates";
import type {
  AcceptanceCriterion,
  BriefAnswers,
  QaCheckResult,
  WorkflowTemplate,
} from "@/delivery/types";
import {
  resolveInWorkspace,
  sha256,
  workspaceFileExists,
} from "@/delivery/workspace";

export type StoredArtifactView = {
  key: string;
  relativePath: string;
  checksumSha256: string;
};

/**
 * Independent QA agent — verifies requirements, files, links, and tests.
 * Does not trust delivery-agent or model claims.
 */
export async function runQaAgent(input: {
  template: WorkflowTemplate;
  brief: BriefAnswers;
  workspaceRoot: string;
  artifacts: StoredArtifactView[];
}): Promise<{ ok: boolean; checks: QaCheckResult[] }> {
  const checks: QaCheckResult[] = [];

  for (const criterion of input.template.acceptanceCriteria) {
    const result = await evaluateCriterion(criterion, input);
    checks.push(result);
  }

  const ok = checks.every(
    (c) => c.status === "passed" || c.status === "skipped",
  );
  return { ok, checks };
}

async function evaluateCriterion(
  criterion: AcceptanceCriterion,
  input: {
    template: WorkflowTemplate;
    brief: BriefAnswers;
    workspaceRoot: string;
    artifacts: StoredArtifactView[];
  },
): Promise<QaCheckResult> {
  const params = criterion.params ?? {};

  switch (criterion.check) {
    case "brief_field": {
      const fields = String(params.fields ?? "")
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean);
      const questions = input.template.intakeQuestions.filter((q) =>
        fields.includes(q.id),
      );
      const subset = Object.fromEntries(
        fields.map((f) => [f, input.brief[f]]),
      ) as BriefAnswers;
      // Re-validate only required fields in the list
      const missing = fields.filter((f) => {
        const q = questions.find((qq) => qq.id === f);
        const required = q?.required ?? true;
        const v = subset[f];
        return required && (v === undefined || v === "");
      });
      const full = validateBrief(
        input.template.intakeQuestions.filter((q) => q.required),
        input.brief,
      );
      if (!full.ok || missing.length) {
        return {
          checkId: criterion.id,
          status: "failed",
          message: `Brief incomplete: ${(missing.length ? missing : full.ok ? [] : full.missing).join(", ")}`,
        };
      }
      return {
        checkId: criterion.id,
        status: "passed",
        message: "Required brief fields present",
      };
    }
    case "artifact_exists": {
      const key = String(params.key ?? "");
      const art = input.artifacts.find((a) => a.key === key);
      if (!art) {
        return {
          checkId: criterion.id,
          status: "failed",
          message: `Artifact missing in registry: ${key}`,
        };
      }
      const exists = await workspaceFileExists(
        input.workspaceRoot,
        art.relativePath,
      );
      return exists
        ? {
            checkId: criterion.id,
            status: "passed",
            message: `File present: ${art.relativePath}`,
            evidence: { key, path: art.relativePath },
          }
        : {
            checkId: criterion.id,
            status: "failed",
            message: `Registry lists ${key} but file missing on disk`,
          };
    }
    case "artifact_checksum": {
      const key = String(params.key ?? "");
      const art = input.artifacts.find((a) => a.key === key);
      if (!art) {
        return {
          checkId: criterion.id,
          status: "failed",
          message: `No artifact for checksum: ${key}`,
        };
      }
      try {
        const buf = await fs.readFile(
          resolveInWorkspace(input.workspaceRoot, art.relativePath),
        );
        const digest = sha256(buf);
        if (digest !== art.checksumSha256) {
          return {
            checkId: criterion.id,
            status: "failed",
            message: `Checksum mismatch for ${key}`,
            evidence: { expected: art.checksumSha256, actual: digest },
          };
        }
        return {
          checkId: criterion.id,
          status: "passed",
          message: "Checksum matches",
          evidence: { digest },
        };
      } catch (error) {
        return {
          checkId: criterion.id,
          status: "failed",
          message: error instanceof Error ? error.message : String(error),
        };
      }
    }
    case "artifact_contains": {
      const key = String(params.key ?? "");
      const briefField = String(params.briefField ?? "");
      const needle = String(input.brief[briefField] ?? params.text ?? "");
      const art = input.artifacts.find((a) => a.key === key);
      if (!art) {
        return {
          checkId: criterion.id,
          status: "failed",
          message: `Artifact missing: ${key}`,
        };
      }
      const text = await fs.readFile(
        resolveInWorkspace(input.workspaceRoot, art.relativePath),
        "utf8",
      );
      return text.includes(needle)
        ? {
            checkId: criterion.id,
            status: "passed",
            message: `Contains expected text from ${briefField || "params"}`,
          }
        : {
            checkId: criterion.id,
            status: "failed",
            message: `Artifact ${key} missing expected text`,
          };
    }
    case "links_valid": {
      const key = String(params.key ?? "site_index");
      const art = input.artifacts.find((a) => a.key === key);
      if (!art) {
        return {
          checkId: criterion.id,
          status: "failed",
          message: `Artifact missing for link check: ${key}`,
        };
      }
      const html = await fs.readFile(
        resolveInWorkspace(input.workspaceRoot, art.relativePath),
        "utf8",
      );
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
        const dir = art.relativePath.split("/").slice(0, -1).join("/");
        const target = `${dir}/${href}`.replace(/\/+/g, "/");
        if (!(await workspaceFileExists(input.workspaceRoot, target))) {
          broken.push(href);
        }
      }
      return broken.length
        ? {
            checkId: criterion.id,
            status: "failed",
            message: `Broken links: ${broken.join(", ")}`,
            evidence: { broken },
          }
        : {
            checkId: criterion.id,
            status: "passed",
            message: `Checked ${hrefs.length} links`,
          };
    }
    case "playwright": {
      const key = String(params.key ?? "site_index");
      const art = input.artifacts.find((a) => a.key === key);
      if (!art) {
        return {
          checkId: criterion.id,
          status: "failed",
          message: `Artifact missing for Playwright: ${key}`,
        };
      }
      const expectField = String(params.expectTextField ?? "");
      const expectText = expectField
        ? String(input.brief[expectField] ?? "")
        : String(params.expectText ?? "");
      const smoke = await runPlaywrightSmoke({
        workspaceRoot: input.workspaceRoot,
        relativePath: art.relativePath,
        expectText: expectText || undefined,
      });
      return smoke.ok
        ? {
            checkId: criterion.id,
            status: "passed",
            message: `Browser smoke passed via ${smoke.engine}`,
            evidence: { title: smoke.title, engine: smoke.engine },
          }
        : {
            checkId: criterion.id,
            status: "failed",
            message: smoke.message,
            evidence: { engine: smoke.engine },
          };
    }
    case "static_test": {
      const suite = String(params.suite ?? "");
      if (suite === "ai_automation_no_exec") {
        const runbook = input.artifacts.find(
          (a) => a.key === "automation_runbook",
        );
        if (!runbook) {
          return {
            checkId: criterion.id,
            status: "failed",
            message: "Runbook missing for no-exec check",
          };
        }
        const text = await fs.readFile(
          resolveInWorkspace(input.workspaceRoot, runbook.relativePath),
          "utf8",
        );
        const banned = /executed on the host|eval\(|child_process|spawn\(/i;
        if (banned.test(text)) {
          return {
            checkId: criterion.id,
            status: "failed",
            message: "Runbook claims or embeds host code execution",
          };
        }
        if (!/do \*\*not\*\* execute model-generated code/i.test(text)) {
          return {
            checkId: criterion.id,
            status: "failed",
            message: "Runbook missing explicit no-execution safety note",
          };
        }
        return {
          checkId: criterion.id,
          status: "passed",
          message: "No host execution claims detected",
        };
      }
      return {
        checkId: criterion.id,
        status: "skipped",
        message: `Unknown static suite ${suite}`,
      };
    }
    default:
      return {
        checkId: criterion.id,
        status: "failed",
        message: `Unknown check type`,
      };
  }
}
