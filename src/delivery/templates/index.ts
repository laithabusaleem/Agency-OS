import { aiAutomationTemplate } from "@/delivery/templates/ai-automation";
import { businessResearchTemplate } from "@/delivery/templates/research";
import { marketingContentTemplate } from "@/delivery/templates/marketing";
import { websiteProjectTemplate } from "@/delivery/templates/website";
import { DeliveryError } from "@/delivery/errors";
import type {
  BriefAnswers,
  DeliveryTemplateId,
  IntakeQuestion,
  WorkflowTemplate,
} from "@/delivery/types";

const TEMPLATES: Record<DeliveryTemplateId, WorkflowTemplate> = {
  website_project: websiteProjectTemplate,
  marketing_content: marketingContentTemplate,
  business_research: businessResearchTemplate,
  ai_automation: aiAutomationTemplate,
};

export function listWorkflowTemplates(): WorkflowTemplate[] {
  return Object.values(TEMPLATES);
}

export function getWorkflowTemplate(id: string): WorkflowTemplate {
  const template = TEMPLATES[id as DeliveryTemplateId];
  if (!template) {
    throw new DeliveryError("unknown_template", `Unknown template: ${id}`);
  }
  return template;
}

export function validateBrief(
  questions: IntakeQuestion[],
  brief: BriefAnswers,
): { ok: true } | { ok: false; missing: string[]; invalid: string[] } {
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const q of questions) {
    const value = brief[q.id];
    if (
      q.required &&
      (value === undefined ||
        value === null ||
        (typeof value === "string" && value.trim() === ""))
    ) {
      missing.push(q.id);
      continue;
    }
    if (value === undefined || value === null || value === "") continue;

    if (q.type === "enum" && q.options && !q.options.includes(String(value))) {
      invalid.push(q.id);
    }
    if (q.type === "url" && typeof value === "string") {
      try {
        void new URL(value);
      } catch {
        invalid.push(q.id);
      }
    }
    if (
      q.type === "number" &&
      typeof value !== "number" &&
      Number.isNaN(Number(value))
    ) {
      invalid.push(q.id);
    }
  }

  if (missing.length || invalid.length) {
    return { ok: false, missing, invalid };
  }
  return { ok: true };
}
