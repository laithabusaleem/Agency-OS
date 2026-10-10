import { sql } from "drizzle-orm";
import {
  integer,
  sqliteTable,
  text,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * Schema is written against SQLite types today.
 * Column semantics stay portable so a future PostgreSQL dialect swap
 * (drizzle-orm/pg-core) can reuse the same domain models and services.
 */

const timestamps = {
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
};

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "member"] })
    .notNull()
    .default("member"),
  organizationId: text("organization_id").notNull(),
  isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
});

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
});

export const leads = sqliteTable(
  "leads",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Empty string means unknown — never invent contacts. */
    email: text("email").notNull().default(""),
    company: text("company"),
    status: text("status", {
      enum: ["new", "contacted", "qualified", "won", "lost"],
    })
      .notNull()
      .default("new"),
    source: text("source"),
    notes: text("notes"),
    // Phase 3 — acquisition enrichment
    domain: text("domain"),
    websiteUrl: text("website_url"),
    market: text("market"),
    niche: text("niche"),
    serviceFit: integer("service_fit").notNull().default(0),
    score: integer("score").notNull().default(0),
    scoreUpdatedAt: text("score_updated_at"),
    emailProvenance: text("email_provenance", {
      enum: ["observed", "inferred", "unknown"],
    })
      .notNull()
      .default("unknown"),
    phone: text("phone"),
    phoneProvenance: text("phone_provenance", {
      enum: ["observed", "inferred", "unknown"],
    })
      .notNull()
      .default("unknown"),
    nameProvenance: text("name_provenance", {
      enum: ["observed", "inferred", "unknown"],
    })
      .notNull()
      .default("unknown"),
    lastRetrievedAt: text("last_retrieved_at"),
    acquisitionSource: text("acquisition_source", {
      enum: ["manual", "csv", "brave_search", "website", "mixed"],
    })
      .notNull()
      .default("manual"),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("leads_org_idx").on(t.organizationId),
    index("leads_org_domain_idx").on(t.organizationId, t.domain),
    index("leads_org_score_idx").on(t.organizationId, t.score),
    index("leads_org_market_idx").on(t.organizationId, t.market),
  ],
);

export const leadEvidence = sqliteTable(
  "lead_evidence",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["fact", "inference", "unknown"] }).notNull(),
    field: text("field").notNull(),
    claim: text("claim").notNull(),
    value: text("value"),
    sourceType: text("source_type", {
      enum: ["brave_search", "website", "csv", "manual", "model", "scoring"],
    }).notNull(),
    sourceUrl: text("source_url"),
    rawExcerpt: text("raw_excerpt"),
    retrievedAt: text("retrieved_at").notNull(),
    staleAfterAt: text("stale_after_at"),
    isStale: integer("is_stale", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index("lead_evidence_lead_idx").on(t.leadId),
    index("lead_evidence_org_idx").on(t.organizationId),
  ],
);

export const leadScoreFactors = sqliteTable(
  "lead_score_factors",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    points: integer("points").notNull().default(0),
    weight: integer("weight").notNull().default(1),
    kind: text("kind", { enum: ["fact", "inference", "unknown"] }).notNull(),
    rationale: text("rationale").notNull().default(""),
    evidenceIdsJson: text("evidence_ids_json").notNull().default("[]"),
    editable: integer("editable", { mode: "boolean" }).notNull().default(true),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index("lead_score_factors_lead_idx").on(t.leadId)],
);

export const acquisitionRuns = sqliteTable(
  "acquisition_runs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    query: text("query").notNull(),
    market: text("market"),
    niche: text("niche"),
    provider: text("provider").notNull(),
    status: text("status", {
      enum: ["pending", "running", "succeeded", "failed", "partial"],
    })
      .notNull()
      .default("pending"),
    resultsCount: integer("results_count").notNull().default(0),
    createdCount: integer("created_count").notNull().default(0),
    dedupedCount: integer("deduped_count").notNull().default(0),
    errorMessage: text("error_message"),
    ...timestamps,
  },
  (t) => [index("acquisition_runs_org_idx").on(t.organizationId)],
);

export const clients = sqliteTable(
  "clients",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    company: text("company"),
    phone: text("phone"),
    status: text("status", { enum: ["active", "inactive", "churned"] })
      .notNull()
      .default("active"),
    notes: text("notes"),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (t) => [index("clients_org_idx").on(t.organizationId)],
);

export const services = sqliteTable(
  "services",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    billingType: text("billing_type", {
      enum: ["fixed", "hourly", "retainer"],
    })
      .notNull()
      .default("fixed"),
    unitPriceCents: integer("unit_price_cents").notNull().default(0),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (t) => [index("services_org_idx").on(t.organizationId)],
);

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: text("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status", {
      enum: ["planned", "active", "on_hold", "completed", "cancelled"],
    })
      .notNull()
      .default("planned"),
    startDate: text("start_date"),
    dueDate: text("due_date"),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (t) => [index("projects_org_idx").on(t.organizationId)],
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status", {
      enum: ["todo", "in_progress", "blocked", "done"],
    })
      .notNull()
      .default("todo"),
    priority: text("priority", { enum: ["low", "medium", "high"] })
      .notNull()
      .default("medium"),
    assigneeId: text("assignee_id").references(() => users.id, {
      onDelete: "set null",
    }),
    dueDate: text("due_date"),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (t) => [index("tasks_org_idx").on(t.organizationId)],
);

/**
 * Phase 2 — Agent runtime tables (SQLite today, portable column semantics).
 */
export const agentJobs = sqliteTable(
  "agent_jobs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    idempotencyKey: text("idempotency_key").notNull(),
    agentType: text("agent_type", {
      enum: [
        "summarize_text",
        "draft_outreach",
        "extract_entities",
        "research_decision_maker",
      ],
    }).notNull(),
    provider: text("provider", {
      enum: ["mock", "gemini", "groq", "openrouter"],
    }).notNull(),
    model: text("model").notNull(),
    status: text("status", {
      enum: [
        "pending",
        "claimed",
        "running",
        "retry_wait",
        "succeeded",
        "failed",
        "cancelled",
        "dead_letter",
        "timed_out",
      ],
    })
      .notNull()
      .default("pending"),
    inputJson: text("input_json").notNull(),
    outputJson: text("output_json"),
    errorJson: text("error_json"),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    timeoutMs: integer("timeout_ms").notNull().default(30_000),
    budgetCents: integer("budget_cents").notNull().default(100),
    costCentsEstimate: integer("cost_cents_estimate").notNull().default(0),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    latencyMs: integer("latency_ms"),
    workerId: text("worker_id"),
    lockedAt: text("locked_at"),
    lockExpiresAt: text("lock_expires_at"),
    availableAt: text("available_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    cancelledAt: text("cancelled_at"),
    lastError: text("last_error"),
    deadLetterReason: text("dead_letter_reason"),
    ...timestamps,
  },
  (t) => [
    index("agent_jobs_org_idx").on(t.organizationId),
    index("agent_jobs_status_avail_idx").on(t.status, t.availableAt),
    uniqueIndex("agent_jobs_idempotency_uidx").on(
      t.organizationId,
      t.idempotencyKey,
    ),
  ],
);

export const agentJobAttempts = sqliteTable(
  "agent_job_attempts",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => agentJobs.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    status: text("status", {
      enum: ["running", "succeeded", "failed", "timed_out", "cancelled"],
    }).notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    retryAfterMs: integer("retry_after_ms"),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    latencyMs: integer("latency_ms"),
    costCentsEstimate: integer("cost_cents_estimate").notNull().default(0),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index("agent_job_attempts_job_idx").on(t.jobId)],
);

export const agentRuntimeSettings = sqliteTable("agent_runtime_settings", {
  id: text("id").primaryKey().default("global"),
  killSwitchEnabled: integer("kill_switch_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  globalBudgetCents: integer("global_budget_cents").notNull().default(50_000),
  globalSpendCents: integer("global_spend_cents").notNull().default(0),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const agentUsageDaily = sqliteTable(
  "agent_usage_daily",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    day: text("day").notNull(),
    spendCents: integer("spend_cents").notNull().default(0),
    requestCount: integer("request_count").notNull().default(0),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index("agent_usage_daily_org_day_idx").on(t.organizationId, t.day)],
);

/**
 * Phase 4 — Sales & outreach
 */
export const outreachSettings = sqliteTable("outreach_settings", {
  id: text("id").primaryKey().default("global"),
  /** Master switch — default OFF. Agents cannot override this. */
  sendingEnabled: integer("sending_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  emergencyStop: integer("emergency_stop", { mode: "boolean" })
    .notNull()
    .default(false),
  dailyQuota: integer("daily_quota").notNull().default(50),
  perCampaignLimit: integer("per_campaign_limit").notNull().default(100),
  rateLimitPerMinute: integer("rate_limit_per_minute").notNull().default(10),
  defaultFromEmail: text("default_from_email"),
  defaultFromName: text("default_from_name"),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const businessAudits = sqliteTable(
  "business_audits",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    status: text("status", {
      enum: ["draft", "in_review", "approved", "archived"],
    })
      .notNull()
      .default("draft"),
    evidenceIdsJson: text("evidence_ids_json").notNull().default("[]"),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    index("business_audits_org_idx").on(t.organizationId),
    index("business_audits_lead_idx").on(t.leadId),
  ],
);

export const auditFindings = sqliteTable(
  "audit_findings",
  {
    id: text("id").primaryKey(),
    auditId: text("audit_id")
      .notNull()
      .references(() => businessAudits.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["fact", "inference", "unknown"] }).notNull(),
    severity: text("severity", {
      enum: ["low", "medium", "high"],
    })
      .notNull()
      .default("medium"),
    title: text("title").notNull(),
    detail: text("detail").notNull().default(""),
    evidenceIdsJson: text("evidence_ids_json").notNull().default("[]"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index("audit_findings_audit_idx").on(t.auditId)],
);

export const outreachCampaigns = sqliteTable(
  "outreach_campaigns",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: text("status", {
      enum: [
        "draft",
        "pending_review",
        "approved",
        "active",
        "paused",
        "completed",
        "stopped",
        "rejected",
      ],
    })
      .notNull()
      .default("draft"),
    category: text("category", {
      enum: ["transactional", "approved_outreach"],
    })
      .notNull()
      .default("approved_outreach"),
    sendLimit: integer("send_limit").notNull().default(50),
    sentCount: integer("sent_count").notNull().default(0),
    approvalRequired: integer("approval_required", { mode: "boolean" })
      .notNull()
      .default(true),
    approvedByUserId: text("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedAt: text("approved_at"),
    approvalNote: text("approval_note"),
    stopReason: text("stop_reason"),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [index("outreach_campaigns_org_idx").on(t.organizationId)],
);

export const outreachMessages = sqliteTable(
  "outreach_messages",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id").references(() => outreachCampaigns.id, {
      onDelete: "set null",
    }),
    leadId: text("lead_id").references(() => leads.id, {
      onDelete: "set null",
    }),
    auditId: text("audit_id").references(() => businessAudits.id, {
      onDelete: "set null",
    }),
    type: text("type", {
      enum: [
        "audit_summary",
        "personalized_outreach",
        "proposal",
        "follow_up",
        "transactional",
      ],
    }).notNull(),
    status: text("status", {
      enum: [
        "draft",
        "in_review",
        "approved",
        "scheduled",
        "sending",
        "sent",
        "failed",
        "cancelled",
        "suppressed",
      ],
    })
      .notNull()
      .default("draft"),
    subject: text("subject").notNull(),
    bodyText: text("body_text").notNull(),
    bodyHtml: text("body_html"),
    toEmail: text("to_email").notNull(),
    evidenceIdsJson: text("evidence_ids_json").notNull().default("[]"),
    personalizationNotes: text("personalization_notes"),
    scheduledFor: text("scheduled_for"),
    reviewNote: text("review_note"),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedByUserId: text("reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: text("reviewed_at"),
    ...timestamps,
  },
  (t) => [
    index("outreach_messages_org_idx").on(t.organizationId),
    index("outreach_messages_status_idx").on(t.status),
    index("outreach_messages_campaign_idx").on(t.campaignId),
  ],
);

export const outreachSends = sqliteTable(
  "outreach_sends",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id").references(() => outreachCampaigns.id, {
      onDelete: "set null",
    }),
    messageId: text("message_id")
      .notNull()
      .references(() => outreachMessages.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status", {
      enum: [
        "queued",
        "claiming",
        "sending",
        "sent",
        "failed",
        "suppressed",
        "cancelled",
      ],
    })
      .notNull()
      .default("queued"),
    provider: text("provider").notNull().default("none"),
    providerMessageId: text("provider_message_id"),
    category: text("category", {
      enum: ["transactional", "approved_outreach"],
    }).notNull(),
    toEmail: text("to_email").notNull(),
    fromEmail: text("from_email").notNull(),
    errorMessage: text("error_message"),
    claimedBy: text("claimed_by"),
    claimedAt: text("claimed_at"),
    sentAt: text("sent_at"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("outreach_sends_idempotency_uidx").on(
      t.organizationId,
      t.idempotencyKey,
    ),
    index("outreach_sends_status_idx").on(t.status),
  ],
);

export const suppressionList = sqliteTable(
  "suppression_list",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    reason: text("reason", {
      enum: [
        "unsubscribe",
        "bounce",
        "complaint",
        "reply_stop",
        "manual",
        "invalid",
      ],
    }).notNull(),
    source: text("source").notNull().default("system"),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    uniqueIndex("suppression_list_org_email_uidx").on(
      t.organizationId,
      t.email,
    ),
  ],
);

export const outreachEvents = sqliteTable(
  "outreach_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sendId: text("send_id").references(() => outreachSends.id, {
      onDelete: "set null",
    }),
    messageId: text("message_id").references(() => outreachMessages.id, {
      onDelete: "set null",
    }),
    campaignId: text("campaign_id").references(() => outreachCampaigns.id, {
      onDelete: "set null",
    }),
    type: text("type", {
      enum: [
        "sent",
        "delivered",
        "bounced",
        "complained",
        "unsubscribed",
        "replied",
        "stopped",
        "failed",
      ],
    }).notNull(),
    email: text("email"),
    payloadJson: text("payload_json"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index("outreach_events_org_idx").on(t.organizationId)],
);

export const outreachQuotaDaily = sqliteTable(
  "outreach_quota_daily",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    day: text("day").notNull(),
    sentCount: integer("sent_count").notNull().default(0),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    uniqueIndex("outreach_quota_daily_org_day_uidx").on(
      t.organizationId,
      t.day,
    ),
  ],
);

export const followUpSchedules = sqliteTable(
  "follow_up_schedules",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    messageId: text("message_id")
      .notNull()
      .references(() => outreachMessages.id, { onDelete: "cascade" }),
    leadId: text("lead_id").references(() => leads.id, {
      onDelete: "set null",
    }),
    dueAt: text("due_at").notNull(),
    status: text("status", {
      enum: ["scheduled", "completed", "cancelled", "stopped"],
    })
      .notNull()
      .default("scheduled"),
    stopReason: text("stop_reason"),
    ...timestamps,
  },
  (t) => [index("follow_up_schedules_due_idx").on(t.status, t.dueAt)],
);

export type User = typeof users.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type LeadEvidence = typeof leadEvidence.$inferSelect;
export type LeadScoreFactor = typeof leadScoreFactors.$inferSelect;
export type AcquisitionRun = typeof acquisitionRuns.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Service = typeof services.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type AgentJob = typeof agentJobs.$inferSelect;
export type AgentJobAttempt = typeof agentJobAttempts.$inferSelect;
export type OutreachCampaign = typeof outreachCampaigns.$inferSelect;
export type OutreachMessage = typeof outreachMessages.$inferSelect;
export type OutreachSend = typeof outreachSends.$inferSelect;

/**
 * Phase 5 — Service delivery
 */
export const deliverySettings = sqliteTable("delivery_settings", {
  id: text("id").primaryKey().default("global"),
  /** Master switch for delivery runs — default on for mock workflows */
  runsEnabled: integer("runs_enabled", { mode: "boolean" })
    .notNull()
    .default(true),
  /** Deploy / publish / spend / destructive require explicit auth records */
  deployEnabled: integer("deploy_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  publicationEnabled: integer("publication_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  spendingEnabled: integer("spending_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  destructiveEnabled: integer("destructive_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  /** Never execute model-generated code on the host */
  allowModelCodeExecution: integer("allow_model_code_execution", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  workspaceRoot: text("workspace_root").notNull().default("./data/workspaces"),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const deliveryWorkflows = sqliteTable(
  "delivery_workflows",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    templateId: text("template_id").notNull(),
    name: text("name").notNull(),
    status: text("status", {
      enum: [
        "draft",
        "brief_incomplete",
        "ready",
        "running",
        "awaiting_qa",
        "qa_failed",
        "needs_revision",
        "delivered",
        "failed",
        "cancelled",
      ],
    })
      .notNull()
      .default("draft"),
    mode: text("mode", { enum: ["mock", "live"] })
      .notNull()
      .default("mock"),
    briefJson: text("brief_json").notNull().default("{}"),
    scopeJson: text("scope_json").notNull().default("{}"),
    failureReason: text("failure_reason"),
    currentVersion: integer("current_version").notNull().default(0),
    workspacePath: text("workspace_path"),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    index("delivery_workflows_org_idx").on(t.organizationId),
    index("delivery_workflows_project_idx").on(t.projectId),
  ],
);

export const deliveryRuns = sqliteTable(
  "delivery_runs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workflowId: text("workflow_id")
      .notNull()
      .references(() => deliveryWorkflows.id, { onDelete: "cascade" }),
    agentKind: text("agent_kind", {
      enum: ["delivery", "qa"],
    }).notNull(),
    status: text("status", {
      enum: [
        "pending",
        "running",
        "succeeded",
        "failed",
        "cancelled",
        "needs_revision",
      ],
    })
      .notNull()
      .default("pending"),
    version: integer("version").notNull().default(1),
    idempotencyKey: text("idempotency_key").notNull(),
    inputJson: text("input_json").notNull().default("{}"),
    resultJson: text("result_json"),
    errorMessage: text("error_message"),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("delivery_runs_idempotency_uidx").on(
      t.organizationId,
      t.idempotencyKey,
    ),
    index("delivery_runs_workflow_idx").on(t.workflowId),
  ],
);

export const deliveryArtifacts = sqliteTable(
  "delivery_artifacts",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workflowId: text("workflow_id")
      .notNull()
      .references(() => deliveryWorkflows.id, { onDelete: "cascade" }),
    runId: text("run_id").references(() => deliveryRuns.id, {
      onDelete: "set null",
    }),
    key: text("key").notNull(),
    relativePath: text("relative_path").notNull(),
    contentType: text("content_type").notNull().default("text/plain"),
    checksumSha256: text("checksum_sha256").notNull(),
    byteSize: integer("byte_size").notNull().default(0),
    version: integer("version").notNull().default(1),
    metadataJson: text("metadata_json").notNull().default("{}"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("delivery_artifacts_workflow_key_version_uidx").on(
      t.workflowId,
      t.key,
      t.version,
    ),
    index("delivery_artifacts_workflow_idx").on(t.workflowId),
  ],
);

export const deliveryQaChecks = sqliteTable(
  "delivery_qa_checks",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workflowId: text("workflow_id")
      .notNull()
      .references(() => deliveryWorkflows.id, { onDelete: "cascade" }),
    runId: text("run_id")
      .notNull()
      .references(() => deliveryRuns.id, { onDelete: "cascade" }),
    checkId: text("check_id").notNull(),
    status: text("status", {
      enum: ["passed", "failed", "skipped"],
    }).notNull(),
    message: text("message").notNull().default(""),
    evidenceJson: text("evidence_json").notNull().default("{}"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index("delivery_qa_checks_run_idx").on(t.runId)],
);

export const deliveryAuthorizations = sqliteTable(
  "delivery_authorizations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workflowId: text("workflow_id").references(() => deliveryWorkflows.id, {
      onDelete: "cascade",
    }),
    action: text("action", {
      enum: ["deploy", "external_publication", "spending", "destructive"],
    }).notNull(),
    status: text("status", {
      enum: ["pending", "approved", "revoked", "consumed"],
    })
      .notNull()
      .default("pending"),
    note: text("note"),
    approvedByUserId: text("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedAt: text("approved_at"),
    expiresAt: text("expires_at"),
    consumedAt: text("consumed_at"),
    ...timestamps,
  },
  (t) => [index("delivery_authorizations_org_idx").on(t.organizationId)],
);

export const deliveryRevisions = sqliteTable(
  "delivery_revisions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workflowId: text("workflow_id")
      .notNull()
      .references(() => deliveryWorkflows.id, { onDelete: "cascade" }),
    fromVersion: integer("from_version").notNull(),
    toVersion: integer("to_version").notNull(),
    reason: text("reason").notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index("delivery_revisions_workflow_idx").on(t.workflowId)],
);

export type DeliveryWorkflow = typeof deliveryWorkflows.$inferSelect;
export type DeliveryRun = typeof deliveryRuns.$inferSelect;
export type DeliveryArtifact = typeof deliveryArtifacts.$inferSelect;
export type DeliveryAuthorization = typeof deliveryAuthorizations.$inferSelect;

/**
 * Decision-Maker Intelligence (DMI)
 */
export const decisionMakerCandidates = sqliteTable(
  "decision_maker_candidates",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    currentRole: text("current_role").notNull().default(""),
    decisionMakerType: text("decision_maker_type", {
      enum: [
        "founder",
        "owner",
        "ceo",
        "managing_director",
        "head_of_marketing",
        "operations_director",
        "other",
        "unknown",
      ],
    })
      .notNull()
      .default("unknown"),
    roleConfidence: integer("role_confidence").notNull().default(0),
    serviceRelevanceScore: integer("service_relevance_score")
      .notNull()
      .default(0),
    professionalSummary: text("professional_summary").notNull().default(""),
    verifiedPrioritiesJson: text("verified_priorities_json")
      .notNull()
      .default("[]"),
    potentialOpportunitiesJson: text("potential_opportunities_json")
      .notNull()
      .default("[]"),
    researchStatus: text("research_status", {
      enum: [
        "pending",
        "researching",
        "needs_review",
        "verified",
        "rejected",
        "stale",
        "failed",
      ],
    })
      .notNull()
      .default("pending"),
    selectedForOutreach: integer("selected_for_outreach", { mode: "boolean" })
      .notNull()
      .default(false),
    lastVerifiedAt: text("last_verified_at"),
    uncertaintyNotes: text("uncertainty_notes"),
    targetService: text("target_service"),
    ...timestamps,
  },
  (t) => [
    index("dmi_candidates_org_idx").on(t.organizationId),
    index("dmi_candidates_lead_idx").on(t.leadId),
  ],
);

export const personEvidence = sqliteTable(
  "person_evidence",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    candidateId: text("candidate_id")
      .notNull()
      .references(() => decisionMakerCandidates.id, { onDelete: "cascade" }),
    sourceUrl: text("source_url").notNull(),
    sourceType: text("source_type", {
      enum: [
        "company_website",
        "brave_search",
        "public_bio",
        "interview",
        "press",
        "professional_profile",
        "manual",
        "fixture",
      ],
    }).notNull(),
    claim: text("claim").notNull(),
    supportingExcerpt: text("supporting_excerpt"),
    kind: text("kind", {
      enum: ["fact", "hypothesis", "unknown"],
    }).notNull(),
    confidence: integer("confidence").notNull().default(0),
    verificationStatus: text("verification_status", {
      enum: ["verified", "unverified", "conflicted", "outdated", "rejected"],
    })
      .notNull()
      .default("unverified"),
    retrievedAt: text("retrieved_at").notNull(),
    publicationDate: text("publication_date"),
    staleAfterAt: text("stale_after_at"),
    isStale: integer("is_stale", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index("person_evidence_candidate_idx").on(t.candidateId),
    index("person_evidence_org_idx").on(t.organizationId),
  ],
);

export const contactChannels = sqliteTable(
  "contact_channels",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    candidateId: text("candidate_id")
      .notNull()
      .references(() => decisionMakerCandidates.id, { onDelete: "cascade" }),
    channelType: text("channel_type", {
      enum: [
        "business_email",
        "published_professional_email",
        "company_contact_form",
        "company_general_email",
        "authorized_networking",
        "other",
      ],
    }).notNull(),
    value: text("value").notNull().default(""),
    provenance: text("provenance", {
      enum: ["verified", "published", "company_level", "inferred", "unknown"],
    })
      .notNull()
      .default("unknown"),
    sourceUrl: text("source_url"),
    discoveryMethod: text("discovery_method").notNull().default(""),
    allowedForAutomation: integer("allowed_for_automation", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("contact_channels_candidate_idx").on(t.candidateId)],
);

export const relationshipInteractions = sqliteTable(
  "relationship_interactions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    candidateId: text("candidate_id").references(
      () => decisionMakerCandidates.id,
      { onDelete: "set null" },
    ),
    type: text("type", {
      enum: [
        "research_completed",
        "evidence_recorded",
        "message_drafted",
        "message_sent",
        "delivery_failed",
        "reply_received",
        "meeting_requested",
        "requirement_shared",
        "proposal_delivered",
        "opt_out",
        "preference_set",
        "correction",
        "human_review",
      ],
    }).notNull(),
    summary: text("summary").notNull(),
    payloadJson: text("payload_json").notNull().default("{}"),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index("relationship_interactions_lead_idx").on(t.leadId),
    index("relationship_interactions_org_idx").on(t.organizationId),
  ],
);

export const outreachStrategyDrafts = sqliteTable(
  "outreach_strategy_drafts",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    candidateId: text("candidate_id").references(
      () => decisionMakerCandidates.id,
      { onDelete: "set null" },
    ),
    status: text("status", {
      enum: ["draft", "needs_verification", "approved", "rejected", "sent"],
    })
      .notNull()
      .default("draft"),
    relevanceReason: text("relevance_reason").notNull().default(""),
    opportunity: text("opportunity").notNull().default(""),
    serviceRationale: text("service_rationale").notNull().default(""),
    evidenceExplanation: text("evidence_explanation").notNull().default(""),
    recipientValue: text("recipient_value").notNull().default(""),
    recommendedChannelId: text("recommended_channel_id"),
    subjectLine: text("subject_line").notNull().default(""),
    primaryMessage: text("primary_message").notNull().default(""),
    alternativeMessage: text("alternative_message").notNull().default(""),
    proposalOutline: text("proposal_outline"),
    confidence: integer("confidence").notNull().default(0),
    factsNeedingVerificationJson: text("facts_needing_verification_json")
      .notNull()
      .default("[]"),
    evidenceIdsJson: text("evidence_ids_json").notNull().default("[]"),
    nextStep: text("next_step").notNull().default(""),
    ...timestamps,
  },
  (t) => [
    index("outreach_strategy_drafts_lead_idx").on(t.leadId),
    index("outreach_strategy_drafts_org_idx").on(t.organizationId),
  ],
);

export const dmiResearchRuns = sqliteTable(
  "dmi_research_runs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["pending", "running", "succeeded", "failed", "cancelled"],
    })
      .notNull()
      .default("pending"),
    mode: text("mode", { enum: ["mock", "live"] }).notNull().default("mock"),
    targetService: text("target_service").notNull().default(""),
    agentJobId: text("agent_job_id"),
    resultJson: text("result_json"),
    errorMessage: text("error_message"),
    idempotencyKey: text("idempotency_key").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("dmi_research_runs_idempotency_uidx").on(
      t.organizationId,
      t.idempotencyKey,
    ),
    index("dmi_research_runs_lead_idx").on(t.leadId),
  ],
);

export type DecisionMakerCandidate =
  typeof decisionMakerCandidates.$inferSelect;
export type PersonEvidence = typeof personEvidence.$inferSelect;
export type ContactChannel = typeof contactChannels.$inferSelect;
export type RelationshipInteraction =
  typeof relationshipInteractions.$inferSelect;
export type OutreachStrategyDraft = typeof outreachStrategyDrafts.$inferSelect;
