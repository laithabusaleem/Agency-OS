import type { WorkflowTemplate } from "@/delivery/types";

export const websiteProjectTemplate: WorkflowTemplate = {
  id: "website_project",
  name: "Website project",
  description:
    "Static marketing site package with intake, scope, HTML artifact, and Playwright QA.",
  intakeQuestions: [
    {
      id: "businessName",
      label: "Business name",
      type: "string",
      required: true,
    },
    {
      id: "primaryGoal",
      label: "Primary conversion goal",
      type: "string",
      required: true,
    },
    {
      id: "brandTone",
      label: "Brand tone",
      type: "enum",
      required: true,
      options: ["professional", "friendly", "bold"],
    },
    {
      id: "targetUrl",
      label: "Reference URL (optional)",
      type: "url",
      required: false,
    },
  ],
  scope: {
    summary: "Deliver a static one-page site package in an isolated workspace.",
    inScope: [
      "Intake validation",
      "Static HTML/CSS generation via allowlisted renderer",
      "Link + Playwright smoke checks",
    ],
    outOfScope: [
      "Hosting deployment without explicit deploy authorization",
      "Executing any model-generated JavaScript on the host",
      "Paid ads spending",
    ],
  },
  allowedTools: [
    "read_fixture",
    "render_static_html",
    "write_artifact",
    "check_links",
    "run_static_tests",
  ],
  dependencies: ["project_record", "isolated_workspace"],
  acceptanceCriteria: [
    {
      id: "brief_complete",
      description: "Required intake fields present",
      check: "brief_field",
      params: { fields: "businessName,primaryGoal,brandTone" },
    },
    {
      id: "index_exists",
      description: "index.html artifact exists",
      check: "artifact_exists",
      params: { key: "site_index" },
    },
    {
      id: "contains_business",
      description: "Page includes business name",
      check: "artifact_contains",
      params: { key: "site_index", briefField: "businessName" },
    },
    {
      id: "checksum_ok",
      description: "Artifact checksum matches stored metadata",
      check: "artifact_checksum",
      params: { key: "site_index" },
    },
    {
      id: "links_ok",
      description: "Internal links resolve in workspace",
      check: "links_valid",
      params: { key: "site_index" },
    },
    {
      id: "playwright_smoke",
      description: "Playwright confirms title and CTA",
      check: "playwright",
      params: { key: "site_index", expectTextField: "primaryGoal" },
    },
  ],
  outputs: [
    {
      key: "site_index",
      relativePath: "site/index.html",
      contentType: "text/html",
      description: "Static landing page",
    },
    {
      key: "site_styles",
      relativePath: "site/styles.css",
      contentType: "text/css",
      description: "Stylesheet",
    },
    {
      key: "delivery_manifest",
      relativePath: "manifest.json",
      contentType: "application/json",
      description: "Versioned delivery manifest",
    },
  ],
  failureConditions: [
    {
      id: "incomplete_brief",
      description: "Missing required intake answers",
      when: "incomplete_brief",
    },
    {
      id: "tool_failure",
      description: "Allowlisted tool failed",
      when: "tool_failure",
    },
    {
      id: "qa_failed",
      description: "Independent QA rejected artifacts",
      when: "qa_failed",
    },
  ],
  steps: [
    {
      id: "load_fixture",
      tool: "read_fixture",
      description: "Load website fixture scaffold",
      params: { fixtureId: "website_base" },
    },
    {
      id: "render_site",
      tool: "render_static_html",
      description: "Render static site from brief + fixture",
      params: { outputKey: "site_index" },
    },
    {
      id: "write_manifest",
      tool: "write_artifact",
      description: "Write delivery manifest",
      params: { key: "delivery_manifest", template: "manifest" },
    },
    {
      id: "link_check",
      tool: "check_links",
      description: "Validate workspace links",
      params: { key: "site_index" },
    },
    {
      id: "static_tests",
      tool: "run_static_tests",
      description: "Run static acceptance tests",
      params: { suite: "website" },
    },
  ],
};
