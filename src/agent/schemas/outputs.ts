import { z } from "zod";
import type { AgentType, StructuredAgentOutput } from "@/agent/types";

const base = {
  summary: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
};

export const summarizeTextOutputSchema = z.object({
  agentType: z.literal("summarize_text"),
  ...base,
  data: z.object({
    bulletPoints: z.array(z.string()).min(1),
    sentiment: z.enum(["positive", "neutral", "negative"]),
  }),
});

export const draftOutreachOutputSchema = z.object({
  agentType: z.literal("draft_outreach"),
  ...base,
  data: z.object({
    subject: z.string().min(1),
    body: z.string().min(1),
    cta: z.string().min(1),
  }),
});

export const extractEntitiesOutputSchema = z.object({
  agentType: z.literal("extract_entities"),
  ...base,
  data: z.object({
    people: z.array(z.string()),
    companies: z.array(z.string()),
    emails: z.array(z.string()),
  }),
});

export const researchDecisionMakerOutputSchema = z.object({
  agentType: z.literal("research_decision_maker"),
  ...base,
  data: z.object({
    candidateIds: z.array(z.string()),
    limitation: z.string().nullable(),
    runId: z.string(),
    cached: z.boolean(),
  }),
});

export const outputSchemas: Record<
  AgentType,
  z.ZodType<StructuredAgentOutput>
> = {
  summarize_text: summarizeTextOutputSchema as z.ZodType<StructuredAgentOutput>,
  draft_outreach: draftOutreachOutputSchema as z.ZodType<StructuredAgentOutput>,
  extract_entities:
    extractEntitiesOutputSchema as z.ZodType<StructuredAgentOutput>,
  research_decision_maker:
    researchDecisionMakerOutputSchema as z.ZodType<StructuredAgentOutput>,
};

export function parseStructuredOutput(
  agentType: AgentType,
  text: string,
): StructuredAgentOutput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Provider returned non-JSON structured output");
  }
  const result = outputSchemas[agentType].safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Structured output validation failed: ${result.error.issues
        .map((i) => i.message)
        .join("; ")}`,
    );
  }
  return result.data;
}

export function buildPrompt(
  agentType: AgentType,
  input: Record<string, unknown>,
) {
  const text = String(input.text ?? input.prompt ?? "");
  switch (agentType) {
    case "summarize_text":
      return `Summarize the following text as JSON with keys agentType="summarize_text", summary, data.bulletPoints[], data.sentiment.\n\nTEXT:\n${text}`;
    case "draft_outreach":
      return `Draft outreach email as JSON with keys agentType="draft_outreach", summary, data.subject, data.body, data.cta.\n\nCONTEXT:\n${text}`;
    case "extract_entities":
      return `Extract entities as JSON with keys agentType="extract_entities", summary, data.people[], data.companies[], data.emails[].\n\nTEXT:\n${text}`;
    case "research_decision_maker":
      return `Decision-maker research is executed by the DMI pipeline, not free-form generation. Input:\n${JSON.stringify(input)}`;
  }
}
