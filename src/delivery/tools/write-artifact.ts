import type { DeliveryTool } from "@/delivery/types";

export const writeArtifactTool: DeliveryTool = {
  id: "write_artifact",
  async execute(ctx, params) {
    const key = String(params.key ?? "artifact");
    const template = String(params.template ?? "text");

    if (template === "manifest") {
      const content = JSON.stringify(
        {
          workflowId: ctx.workflowId,
          version: ctx.version,
          mode: ctx.mode,
          brief: ctx.brief,
          generatedAt: new Date().toISOString(),
          note: "Checksums recorded separately in delivery_artifacts",
        },
        null,
        2,
      );
      return {
        ok: true,
        artifacts: [
          {
            key,
            relativePath: "manifest.json",
            contentType: "application/json",
            content,
            metadata: { template },
          },
        ],
      };
    }

    const content = String(params.content ?? "");
    const relativePath = String(params.relativePath ?? `artifacts/${key}.txt`);
    return {
      ok: true,
      artifacts: [
        {
          key,
          relativePath,
          contentType: String(params.contentType ?? "text/plain"),
          content,
        },
      ],
    };
  },
};
