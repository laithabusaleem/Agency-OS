export const DELIVERY_TEMPLATE_IDS = [
  "website_project",
  "marketing_content",
  "business_research",
  "ai_automation",
] as const;

export type DeliveryTemplateId = (typeof DELIVERY_TEMPLATE_IDS)[number];

export const DELIVERY_TOOLS = [
  "write_artifact",
  "read_fixture",
  "render_static_html",
  "check_links",
  "run_static_tests",
  "fetch_research",
  "compose_document",
] as const;

export type DeliveryToolId = (typeof DELIVERY_TOOLS)[number];

export const PRIVILEGED_ACTIONS = [
  "deploy",
  "external_publication",
  "spending",
  "destructive",
] as const;

export type PrivilegedAction = (typeof PRIVILEGED_ACTIONS)[number];

export type IntakeQuestion = {
  id: string;
  label: string;
  type: "string" | "text" | "url" | "enum" | "number" | "boolean";
  required: boolean;
  options?: string[];
  description?: string;
};

export type AcceptanceCriterion = {
  id: string;
  description: string;
  /** How QA verifies — never trust model claims alone */
  check:
    | "brief_field"
    | "artifact_exists"
    | "artifact_checksum"
    | "artifact_contains"
    | "links_valid"
    | "playwright"
    | "static_test";
  params?: Record<string, string | number | boolean>;
};

export type FailureCondition = {
  id: string;
  description: string;
  when:
    | "incomplete_brief"
    | "tool_failure"
    | "missing_artifact"
    | "qa_failed"
    | "invalid_checksum"
    | "unauthorized_action";
};

export type ExpectedOutput = {
  key: string;
  relativePath: string;
  contentType: string;
  description: string;
};

export type WorkflowTemplate = {
  id: DeliveryTemplateId;
  name: string;
  description: string;
  intakeQuestions: IntakeQuestion[];
  scope: {
    summary: string;
    inScope: string[];
    outOfScope: string[];
  };
  allowedTools: DeliveryToolId[];
  dependencies: string[];
  acceptanceCriteria: AcceptanceCriterion[];
  outputs: ExpectedOutput[];
  failureConditions: FailureCondition[];
  /** Steps the delivery agent executes (allowlisted tools only) */
  steps: Array<{
    id: string;
    tool: DeliveryToolId;
    description: string;
    params?: Record<string, unknown>;
  }>;
};

export type BriefAnswers = Record<string, string | number | boolean>;

export type ToolContext = {
  organizationId: string;
  workflowId: string;
  projectId: string;
  workspaceRoot: string;
  mode: "mock" | "live";
  brief: BriefAnswers;
  version: number;
  /** Scratch bag shared across steps in a single delivery run */
  bag: Record<string, unknown>;
};

export type ToolResult =
  | {
      ok: true;
      artifacts?: Array<{
        key: string;
        relativePath: string;
        contentType: string;
        content: string | Buffer;
        metadata?: Record<string, unknown>;
      }>;
      data?: Record<string, unknown>;
    }
  | {
      ok: false;
      code: string;
      message: string;
      retryable: boolean;
    };

export type DeliveryTool = {
  id: DeliveryToolId;
  execute(
    ctx: ToolContext,
    params: Record<string, unknown>,
  ): Promise<ToolResult>;
};

export type QaCheckResult = {
  checkId: string;
  status: "passed" | "failed" | "skipped";
  message: string;
  evidence?: Record<string, unknown>;
};
