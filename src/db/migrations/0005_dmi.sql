CREATE TABLE `contact_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`channel_type` text NOT NULL,
	`value` text DEFAULT '' NOT NULL,
	`provenance` text DEFAULT 'unknown' NOT NULL,
	`source_url` text,
	`discovery_method` text DEFAULT '' NOT NULL,
	`allowed_for_automation` integer DEFAULT false NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`candidate_id`) REFERENCES `decision_maker_candidates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `contact_channels_candidate_idx` ON `contact_channels` (`candidate_id`);--> statement-breakpoint
CREATE TABLE `decision_maker_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`lead_id` text NOT NULL,
	`full_name` text NOT NULL,
	`current_role` text DEFAULT '' NOT NULL,
	`decision_maker_type` text DEFAULT 'unknown' NOT NULL,
	`role_confidence` integer DEFAULT 0 NOT NULL,
	`service_relevance_score` integer DEFAULT 0 NOT NULL,
	`professional_summary` text DEFAULT '' NOT NULL,
	`verified_priorities_json` text DEFAULT '[]' NOT NULL,
	`potential_opportunities_json` text DEFAULT '[]' NOT NULL,
	`research_status` text DEFAULT 'pending' NOT NULL,
	`selected_for_outreach` integer DEFAULT false NOT NULL,
	`last_verified_at` text,
	`uncertainty_notes` text,
	`target_service` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dmi_candidates_org_idx` ON `decision_maker_candidates` (`organization_id`);--> statement-breakpoint
CREATE INDEX `dmi_candidates_lead_idx` ON `decision_maker_candidates` (`lead_id`);--> statement-breakpoint
CREATE TABLE `dmi_research_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`lead_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`mode` text DEFAULT 'mock' NOT NULL,
	`target_service` text DEFAULT '' NOT NULL,
	`agent_job_id` text,
	`result_json` text,
	`error_message` text,
	`idempotency_key` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dmi_research_runs_idempotency_uidx` ON `dmi_research_runs` (`organization_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `dmi_research_runs_lead_idx` ON `dmi_research_runs` (`lead_id`);--> statement-breakpoint
CREATE TABLE `outreach_strategy_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`lead_id` text NOT NULL,
	`candidate_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`relevance_reason` text DEFAULT '' NOT NULL,
	`opportunity` text DEFAULT '' NOT NULL,
	`service_rationale` text DEFAULT '' NOT NULL,
	`evidence_explanation` text DEFAULT '' NOT NULL,
	`recipient_value` text DEFAULT '' NOT NULL,
	`recommended_channel_id` text,
	`subject_line` text DEFAULT '' NOT NULL,
	`primary_message` text DEFAULT '' NOT NULL,
	`alternative_message` text DEFAULT '' NOT NULL,
	`proposal_outline` text,
	`confidence` integer DEFAULT 0 NOT NULL,
	`facts_needing_verification_json` text DEFAULT '[]' NOT NULL,
	`evidence_ids_json` text DEFAULT '[]' NOT NULL,
	`next_step` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`candidate_id`) REFERENCES `decision_maker_candidates`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `outreach_strategy_drafts_lead_idx` ON `outreach_strategy_drafts` (`lead_id`);--> statement-breakpoint
CREATE INDEX `outreach_strategy_drafts_org_idx` ON `outreach_strategy_drafts` (`organization_id`);--> statement-breakpoint
CREATE TABLE `person_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`source_url` text NOT NULL,
	`source_type` text NOT NULL,
	`claim` text NOT NULL,
	`supporting_excerpt` text,
	`kind` text NOT NULL,
	`confidence` integer DEFAULT 0 NOT NULL,
	`verification_status` text DEFAULT 'unverified' NOT NULL,
	`retrieved_at` text NOT NULL,
	`publication_date` text,
	`stale_after_at` text,
	`is_stale` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`candidate_id`) REFERENCES `decision_maker_candidates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `person_evidence_candidate_idx` ON `person_evidence` (`candidate_id`);--> statement-breakpoint
CREATE INDEX `person_evidence_org_idx` ON `person_evidence` (`organization_id`);--> statement-breakpoint
CREATE TABLE `relationship_interactions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`lead_id` text NOT NULL,
	`candidate_id` text,
	`type` text NOT NULL,
	`summary` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`created_by_user_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`candidate_id`) REFERENCES `decision_maker_candidates`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `relationship_interactions_lead_idx` ON `relationship_interactions` (`lead_id`);--> statement-breakpoint
CREATE INDEX `relationship_interactions_org_idx` ON `relationship_interactions` (`organization_id`);