import { DeliveryError } from "@/delivery/errors";
import { executeAllowedTool } from "@/delivery/tools/registry";
import type { WorkflowTemplate } from "@/delivery/types";
import type { ToolContext, ToolResult } from "@/delivery/types";
import { validateBrief } from "@/delivery/templates";
import { writeWorkspaceFile } from "@/delivery/workspace";

export type DeliveryAgentResult = {
  ok: boolean;
  steps: Array<{
    id: string;
    tool: string;
    ok: boolean;
    message?: string;
    data?: Record<string, unknown>;
  }>;
  artifacts: NonNullable<Extract<ToolResult, { ok: true }>["artifacts"]>;
  error?: string;
};

/**
 * Delivery agent — executes allowlisted template steps only.
 * Never runs model-generated code; never performs privileged actions.
 * Artifacts are written to the isolated workspace as soon as tools produce them
 * so later steps (link checks, static tests) can read real files.
 */
export async function runDeliveryAgent(input: {
  template: WorkflowTemplate;
  ctx: ToolContext;
}): Promise<DeliveryAgentResult> {
  const briefCheck = validateBrief(
    input.template.intakeQuestions,
    input.ctx.brief,
  );
  if (!briefCheck.ok) {
    throw new DeliveryError(
      "incomplete_brief",
      `Incomplete brief: missing=${briefCheck.missing.join(",") || "-"} invalid=${briefCheck.invalid.join(",") || "-"}`,
    );
  }

  const steps: DeliveryAgentResult["steps"] = [];
  const artifacts: DeliveryAgentResult["artifacts"] = [];

  for (const step of input.template.steps) {
    const result = await executeAllowedTool(
      input.template.allowedTools,
      step.tool,
      input.ctx,
      { ...(step.params ?? {}), ...input.ctx.bag },
    );

    if (!result.ok) {
      steps.push({
        id: step.id,
        tool: step.tool,
        ok: false,
        message: result.message,
      });
      return {
        ok: false,
        steps,
        artifacts,
        error: `${step.id}: ${result.message}`,
      };
    }

    if (result.artifacts?.length) {
      for (const art of result.artifacts) {
        await writeWorkspaceFile(
          input.ctx.workspaceRoot,
          art.relativePath,
          art.content,
        );
        // Dedupe by key — later writes replace earlier content for the same key
        const idx = artifacts.findIndex((a) => a.key === art.key);
        if (idx >= 0) artifacts[idx] = art;
        else artifacts.push(art);
      }
    }
    if (result.data) {
      Object.assign(input.ctx.bag, result.data);
    }
    steps.push({
      id: step.id,
      tool: step.tool,
      ok: true,
      data: result.data,
    });
  }

  // Ensure expected outputs were produced
  for (const output of input.template.outputs) {
    if (!artifacts.some((a) => a.key === output.key)) {
      return {
        ok: false,
        steps,
        artifacts,
        error: `Missing expected artifact key: ${output.key}`,
      };
    }
  }

  return { ok: true, steps, artifacts };
}
