import type { WorkflowTemplate } from "@/delivery/types";

export const businessResearchTemplate: WorkflowTemplate = {
  id: "business_research",
  name: "Business research",
  description:
    "Research pack using mock fixtures or live Brave Search when configured.",
  intakeQuestions: [
    {
      id: "topic",
      label: "Research topic",
      type: "string",
      required: true,
    },
    {
      id: "market",
      label: "Market / geography",
      type: "string",
      required: true,
    },
    {
      id: "questions",
      label: "Key questions",
      type: "text",
      required: true,
    },
  ],
  scope: {
    summary:
      "Produce a sourced research memo. Live mode uses Brave when credentials exist.",
    inScope: [
      "Topic intake",
      "Fixture or Brave-backed research notes",
      "Citations file",
    ],
    outOfScope: [
      "Invented contacts or unverified claims presented as facts",
      "External publication without authorization",
    ],
  },
  allowedTools: [
    "read_fixture",
    "fetch_research",
    "compose_document",
    "write_artifact",
  ],
  dependencies: ["project_record", "isolated_workspace"],
  acceptanceCriteria: [
    {
      id: "brief_complete",
      description: "Research intake complete",
      check: "brief_field",
      params: { fields: "topic,market,questions" },
    },
    {
      id: "memo_exists",
      description: "Research memo exists",
      check: "artifact_exists",
      params: { key: "research_memo" },
    },
    {
      id: "citations_exist",
      description: "Citations artifact exists",
      check: "artifact_exists",
      params: { key: "citations" },
    },
    {
      id: "topic_in_memo",
      description: "Memo references topic",
      check: "artifact_contains",
      params: { key: "research_memo", briefField: "topic" },
    },
  ],
  outputs: [
    {
      key: "research_memo",
      relativePath: "research/memo.md",
      contentType: "text/markdown",
      description: "Research memo",
    },
    {
      key: "citations",
      relativePath: "research/citations.json",
      contentType: "application/json",
      description: "Source citations",
    },
  ],
  failureConditions: [
    {
      id: "incomplete_brief",
      description: "Incomplete research brief",
      when: "incomplete_brief",
    },
    {
      id: "tool_failure",
      description: "Research tool failed (e.g. missing live credentials)",
      when: "tool_failure",
    },
  ],
  steps: [
    {
      id: "research",
      tool: "fetch_research",
      description: "Gather research via fixture or Brave",
      params: {},
    },
    {
      id: "memo",
      tool: "compose_document",
      description: "Compose research memo",
      params: { kind: "research_memo", key: "research_memo" },
    },
  ],
};
