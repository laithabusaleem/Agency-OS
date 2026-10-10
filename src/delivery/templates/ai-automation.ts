import type { WorkflowTemplate } from "@/delivery/types";

export const aiAutomationTemplate: WorkflowTemplate = {
  id: "ai_automation",
  name: "AI automation project",
  description:
    "Automation design pack with runbook and test plan — no host code execution.",
  intakeQuestions: [
    {
      id: "processName",
      label: "Process to automate",
      type: "string",
      required: true,
    },
    {
      id: "trigger",
      label: "Trigger",
      type: "string",
      required: true,
    },
    {
      id: "successMetric",
      label: "Success metric",
      type: "string",
      required: true,
    },
    {
      id: "systems",
      label: "Systems involved",
      type: "string",
      required: true,
    },
  ],
  scope: {
    summary:
      "Design an automation runbook and test plan. Never runs model-generated code.",
    inScope: ["Automation design doc", "Test plan", "Failure / rollback notes"],
    outOfScope: [
      "Executing generated scripts on the host",
      "Production deploy without authorization",
      "Spending on third-party automation seats without authorization",
    ],
  },
  allowedTools: ["read_fixture", "compose_document", "write_artifact"],
  dependencies: ["project_record", "isolated_workspace"],
  acceptanceCriteria: [
    {
      id: "brief_complete",
      description: "Automation intake complete",
      check: "brief_field",
      params: { fields: "processName,trigger,successMetric,systems" },
    },
    {
      id: "runbook",
      description: "Runbook artifact exists",
      check: "artifact_exists",
      params: { key: "automation_runbook" },
    },
    {
      id: "test_plan",
      description: "Test plan artifact exists",
      check: "artifact_exists",
      params: { key: "automation_tests" },
    },
    {
      id: "mentions_process",
      description: "Runbook mentions process name",
      check: "artifact_contains",
      params: { key: "automation_runbook", briefField: "processName" },
    },
    {
      id: "no_exec_claim",
      description: "Artifacts must not claim host code was executed",
      check: "static_test",
      params: { suite: "ai_automation_no_exec" },
    },
  ],
  outputs: [
    {
      key: "automation_runbook",
      relativePath: "automation/runbook.md",
      contentType: "text/markdown",
      description: "Automation runbook",
    },
    {
      key: "automation_tests",
      relativePath: "automation/test-plan.md",
      contentType: "text/markdown",
      description: "Test plan",
    },
  ],
  failureConditions: [
    {
      id: "incomplete_brief",
      description: "Incomplete automation brief",
      when: "incomplete_brief",
    },
    {
      id: "unauthorized",
      description: "Attempted privileged action without auth",
      when: "unauthorized_action",
    },
  ],
  steps: [
    {
      id: "fixture",
      tool: "read_fixture",
      description: "Load automation fixture",
      params: { fixtureId: "automation_base" },
    },
    {
      id: "runbook",
      tool: "compose_document",
      description: "Compose runbook",
      params: { kind: "automation_runbook", key: "automation_runbook" },
    },
    {
      id: "tests",
      tool: "compose_document",
      description: "Compose test plan",
      params: { kind: "automation_tests", key: "automation_tests" },
    },
  ],
};
