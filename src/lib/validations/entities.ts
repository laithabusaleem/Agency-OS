import { z } from "zod";

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => v === "" || z.string().email().safeParse(v).success, {
    message: "Valid email required (or leave blank if unknown)",
  });

const provenance = z.enum(["observed", "inferred", "unknown"]);

export const leadSchema = z.object({
  name: z.string().min(1, "Name is required").max(120).trim(),
  email: optionalEmail,
  company: z.string().max(160).trim().optional().or(z.literal("")),
  status: z.enum(["new", "contacted", "qualified", "won", "lost"]),
  source: z.string().max(120).trim().optional().or(z.literal("")),
  notes: z.string().max(2000).trim().optional().or(z.literal("")),
  domain: z.string().max(255).trim().optional().or(z.literal("")),
  websiteUrl: z.string().max(500).trim().optional().or(z.literal("")),
  market: z.string().max(80).trim().optional().or(z.literal("")),
  niche: z.string().max(80).trim().optional().or(z.literal("")),
  serviceFit: z.coerce.number().int().min(0).max(100).optional().default(0),
  phone: z.string().max(40).trim().optional().or(z.literal("")),
  emailProvenance: provenance.optional().default("unknown"),
  phoneProvenance: provenance.optional().default("unknown"),
  nameProvenance: provenance.optional().default("observed"),
});

export const clientSchema = z.object({
  name: z.string().min(1, "Name is required").max(120).trim(),
  email: z.string().email("Valid email required").trim().toLowerCase(),
  company: z.string().max(160).trim().optional().or(z.literal("")),
  phone: z.string().max(40).trim().optional().or(z.literal("")),
  status: z.enum(["active", "inactive", "churned"]),
  notes: z.string().max(2000).trim().optional().or(z.literal("")),
});

export const serviceSchema = z.object({
  name: z.string().min(1, "Name is required").max(120).trim(),
  description: z.string().max(2000).trim().optional().or(z.literal("")),
  billingType: z.enum(["fixed", "hourly", "retainer"]),
  unitPriceCents: z.coerce.number().int().min(0).max(100_000_000),
  isActive: z
    .union([
      z.boolean(),
      z.literal("true"),
      z.literal("false"),
      z.literal("on"),
    ])
    .transform((v) => v === true || v === "true" || v === "on"),
});

export const projectSchema = z.object({
  name: z.string().min(1, "Name is required").max(160).trim(),
  description: z.string().max(2000).trim().optional().or(z.literal("")),
  clientId: z.string().optional().or(z.literal("")),
  status: z.enum(["planned", "active", "on_hold", "completed", "cancelled"]),
  startDate: z.string().optional().or(z.literal("")),
  dueDate: z.string().optional().or(z.literal("")),
});

export const taskSchema = z.object({
  title: z.string().min(1, "Title is required").max(200).trim(),
  description: z.string().max(2000).trim().optional().or(z.literal("")),
  projectId: z.string().optional().or(z.literal("")),
  status: z.enum(["todo", "in_progress", "blocked", "done"]),
  priority: z.enum(["low", "medium", "high"]),
  assigneeId: z.string().optional().or(z.literal("")),
  dueDate: z.string().optional().or(z.literal("")),
});

export type LeadInput = z.infer<typeof leadSchema>;
export type ClientInput = z.infer<typeof clientSchema>;
export type ServiceInput = z.infer<typeof serviceSchema>;
export type ProjectInput = z.infer<typeof projectSchema>;
export type TaskInput = z.infer<typeof taskSchema>;
