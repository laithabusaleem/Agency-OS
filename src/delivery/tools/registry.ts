import { DeliveryError } from "@/delivery/errors";
import type {
  DeliveryTool,
  DeliveryToolId,
  ToolContext,
  ToolResult,
} from "@/delivery/types";
import { checkLinksTool } from "@/delivery/tools/check-links";
import { composeDocumentTool } from "@/delivery/tools/compose-document";
import { fetchResearchTool } from "@/delivery/tools/fetch-research";
import { readFixtureTool } from "@/delivery/tools/read-fixture";
import { renderStaticHtmlTool } from "@/delivery/tools/render-static";
import { runStaticTestsTool } from "@/delivery/tools/run-static-tests";
import { writeArtifactTool } from "@/delivery/tools/write-artifact";

const TOOLS: Record<DeliveryToolId, DeliveryTool> = {
  write_artifact: writeArtifactTool,
  read_fixture: readFixtureTool,
  render_static_html: renderStaticHtmlTool,
  check_links: checkLinksTool,
  run_static_tests: runStaticTestsTool,
  fetch_research: fetchResearchTool,
  compose_document: composeDocumentTool,
};

export function getDeliveryTool(id: DeliveryToolId): DeliveryTool {
  const tool = TOOLS[id];
  if (!tool) {
    throw new DeliveryError("tool_not_allowed", `Unknown tool: ${id}`);
  }
  return tool;
}

export async function executeAllowedTool(
  allowed: DeliveryToolId[],
  id: DeliveryToolId,
  ctx: ToolContext,
  params: Record<string, unknown>,
): Promise<ToolResult> {
  if (!allowed.includes(id)) {
    throw new DeliveryError(
      "tool_not_allowed",
      `Tool ${id} is not allowed for this workflow`,
    );
  }
  // Hard block: never treat model code as executable
  if (
    params.executeCode === true ||
    params.eval === true ||
    params.shell === true
  ) {
    throw new DeliveryError(
      "model_code_blocked",
      "Refusing to execute model-generated or arbitrary code on the host",
    );
  }
  return getDeliveryTool(id).execute(ctx, params);
}
