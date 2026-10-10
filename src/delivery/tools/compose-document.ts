import type { DeliveryTool } from "@/delivery/types";

export const composeDocumentTool: DeliveryTool = {
  id: "compose_document",
  async execute(ctx, params) {
    const kind = String(params.kind ?? "document");
    const key = String(params.key ?? kind);
    const research = ctx.bag.research as
      | {
          provider: string;
          sources: Array<{ title: string; url: string; snippet: string }>;
        }
      | undefined;

    if (kind === "campaign_brief") {
      const content = `# ${ctx.brief.campaignName}

## Audience
${ctx.brief.audience}

## Offer
${ctx.brief.offer}

## Channels
${ctx.brief.channels}

## Notes
Drafted in isolated workspace (mode=${ctx.mode}). External publication requires explicit authorization.
`;
      return {
        ok: true,
        artifacts: [
          {
            key,
            relativePath: "content/brief.md",
            contentType: "text/markdown",
            content,
          },
        ],
      };
    }

    if (kind === "channel_copy") {
      const content = `# Channel copy — ${ctx.brief.campaignName}

## Hook
For ${ctx.brief.audience}: ${ctx.brief.offer}

## Channels
${String(ctx.brief.channels)
  .split(",")
  .map((c) => c.trim())
  .filter(Boolean)
  .map((c) => `- **${c}**: Try ${ctx.brief.offer} today.`)
  .join("\n")}
`;
      return {
        ok: true,
        artifacts: [
          {
            key,
            relativePath: "content/channel-copy.md",
            contentType: "text/markdown",
            content,
          },
        ],
      };
    }

    if (kind === "research_memo") {
      const sources = research?.sources ?? [];
      const content = `# Research memo: ${ctx.brief.topic}

Market: ${ctx.brief.market}

## Questions
${ctx.brief.questions}

## Findings
${sources.length ? sources.map((s) => `- ${s.title}: ${s.snippet}`).join("\n") : "- No sources gathered"}

## Mode
${ctx.mode} (${research?.provider ?? "none"})
`;
      const citations = JSON.stringify(
        { topic: ctx.brief.topic, sources, provider: research?.provider },
        null,
        2,
      );
      return {
        ok: true,
        artifacts: [
          {
            key,
            relativePath: "research/memo.md",
            contentType: "text/markdown",
            content,
          },
          {
            key: "citations",
            relativePath: "research/citations.json",
            contentType: "application/json",
            content: citations,
          },
        ],
      };
    }

    if (kind === "automation_runbook") {
      const content = `# Automation runbook: ${ctx.brief.processName}

## Trigger
${ctx.brief.trigger}

## Systems
${ctx.brief.systems}

## Success metric
${ctx.brief.successMetric}

## Safety
- Do **not** execute model-generated code on the host.
- Deploy / spending / destructive steps require explicit authorization records.
- Rollback: disable automation toggle and restore prior manual process.
`;
      return {
        ok: true,
        artifacts: [
          {
            key,
            relativePath: "automation/runbook.md",
            contentType: "text/markdown",
            content,
          },
        ],
      };
    }

    if (kind === "automation_tests") {
      const content = `# Test plan: ${ctx.brief.processName}

1. Validate trigger fires once per event
2. Confirm systems touched: ${ctx.brief.systems}
3. Measure: ${ctx.brief.successMetric}
4. Negative: unauthorized deploy attempt is rejected
5. Confirm no host execution of generated scripts occurred
`;
      return {
        ok: true,
        artifacts: [
          {
            key,
            relativePath: "automation/test-plan.md",
            contentType: "text/markdown",
            content,
          },
        ],
      };
    }

    return {
      ok: false,
      code: "unknown_kind",
      message: `Unknown document kind ${kind}`,
      retryable: false,
    };
  },
};
