import type { WorkflowTemplate } from "@/delivery/types";

export const marketingContentTemplate: WorkflowTemplate = {
  id: "marketing_content",
  name: "Marketing / content package",
  description:
    "Content pack with brief, copy artifacts, and checklist acceptance.",
  intakeQuestions: [
    {
      id: "campaignName",
      label: "Campaign name",
      type: "string",
      required: true,
    },
    {
      id: "audience",
      label: "Target audience",
      type: "text",
      required: true,
    },
    {
      id: "offer",
      label: "Core offer",
      type: "text",
      required: true,
    },
    {
      id: "channels",
      label: "Channels",
      type: "string",
      required: true,
      description: "Comma-separated channels",
    },
  ],
  scope: {
    summary: "Produce a content package (brief + channel copy) for review.",
    inScope: ["Campaign brief", "Channel copy drafts", "QA against intake"],
    outOfScope: [
      "External publication without authorization",
      "Paid media spending",
    ],
  },
  allowedTools: ["read_fixture", "compose_document", "write_artifact"],
  dependencies: ["project_record", "isolated_workspace"],
  acceptanceCriteria: [
    {
      id: "brief_complete",
      description: "Campaign intake complete",
      check: "brief_field",
      params: { fields: "campaignName,audience,offer,channels" },
    },
    {
      id: "brief_doc",
      description: "Campaign brief artifact exists",
      check: "artifact_exists",
      params: { key: "campaign_brief" },
    },
    {
      id: "copy_doc",
      description: "Channel copy artifact exists",
      check: "artifact_exists",
      params: { key: "channel_copy" },
    },
    {
      id: "mentions_offer",
      description: "Copy mentions the offer",
      check: "artifact_contains",
      params: { key: "channel_copy", briefField: "offer" },
    },
  ],
  outputs: [
    {
      key: "campaign_brief",
      relativePath: "content/brief.md",
      contentType: "text/markdown",
      description: "Campaign brief",
    },
    {
      key: "channel_copy",
      relativePath: "content/channel-copy.md",
      contentType: "text/markdown",
      description: "Channel copy pack",
    },
  ],
  failureConditions: [
    {
      id: "incomplete_brief",
      description: "Incomplete marketing intake",
      when: "incomplete_brief",
    },
    {
      id: "qa_failed",
      description: "Content failed independent QA",
      when: "qa_failed",
    },
  ],
  steps: [
    {
      id: "fixture",
      tool: "read_fixture",
      description: "Load marketing fixture",
      params: { fixtureId: "marketing_base" },
    },
    {
      id: "compose_brief",
      tool: "compose_document",
      description: "Compose campaign brief",
      params: { kind: "campaign_brief", key: "campaign_brief" },
    },
    {
      id: "compose_copy",
      tool: "compose_document",
      description: "Compose channel copy",
      params: { kind: "channel_copy", key: "channel_copy" },
    },
  ],
};
