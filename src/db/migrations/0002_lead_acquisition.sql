CREATE TABLE `acquisition_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`created_by_user_id` text,
	`query` text NOT NULL,
	`market` text,
	`niche` text,
	`provider` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`results_count` integer DEFAULT 0 NOT NULL,
	`created_count` integer DEFAULT 0 NOT NULL,
	`deduped_count` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `acquisition_runs_org_idx` ON `acquisition_runs` (`organization_id`);--> statement-breakpoint
CREATE TABLE `lead_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`kind` text NOT NULL,
	`field` text NOT NULL,
	`claim` text NOT NULL,
	`value` text,
	`source_type` text NOT NULL,
	`source_url` text,
	`raw_excerpt` text,
	`retrieved_at` text NOT NULL,
	`stale_after_at` text,
	`is_stale` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lead_evidence_lead_idx` ON `lead_evidence` (`lead_id`);--> statement-breakpoint
CREATE INDEX `lead_evidence_org_idx` ON `lead_evidence` (`organization_id`);--> statement-breakpoint
CREATE TABLE `lead_score_factors` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`points` integer DEFAULT 0 NOT NULL,
	`weight` integer DEFAULT 1 NOT NULL,
	`kind` text NOT NULL,
	`rationale` text DEFAULT '' NOT NULL,
	`evidence_ids_json` text DEFAULT '[]' NOT NULL,
	`editable` integer DEFAULT true NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lead_score_factors_lead_idx` ON `lead_score_factors` (`lead_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_leads` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`company` text,
	`status` text DEFAULT 'new' NOT NULL,
	`source` text,
	`notes` text,
	`domain` text,
	`website_url` text,
	`market` text,
	`niche` text,
	`service_fit` integer DEFAULT 0 NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`score_updated_at` text,
	`email_provenance` text DEFAULT 'unknown' NOT NULL,
	`phone` text,
	`phone_provenance` text DEFAULT 'unknown' NOT NULL,
	`name_provenance` text DEFAULT 'unknown' NOT NULL,
	`last_retrieved_at` text,
	`acquisition_source` text DEFAULT 'manual' NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_leads`("id", "organization_id", "name", "email", "company", "status", "source", "notes", "domain", "website_url", "market", "niche", "service_fit", "score", "score_updated_at", "email_provenance", "phone", "phone_provenance", "name_provenance", "last_retrieved_at", "acquisition_source", "is_demo", "created_at", "updated_at") SELECT "id", "organization_id", "name", "email", "company", "status", "source", "notes", NULL, NULL, NULL, NULL, 0, 0, NULL, 'unknown', NULL, 'unknown', 'observed', NULL, 'manual', "is_demo", "created_at", "updated_at" FROM `leads`;--> statement-breakpoint
DROP TABLE `leads`;--> statement-breakpoint
ALTER TABLE `__new_leads` RENAME TO `leads`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `leads_org_idx` ON `leads` (`organization_id`);--> statement-breakpoint
CREATE INDEX `leads_org_domain_idx` ON `leads` (`organization_id`,`domain`);--> statement-breakpoint
CREATE INDEX `leads_org_score_idx` ON `leads` (`organization_id`,`score`);--> statement-breakpoint
CREATE INDEX `leads_org_market_idx` ON `leads` (`organization_id`,`market`);