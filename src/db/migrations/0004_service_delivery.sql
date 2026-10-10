CREATE TABLE `delivery_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`workflow_id` text NOT NULL,
	`run_id` text,
	`key` text NOT NULL,
	`relative_path` text NOT NULL,
	`content_type` text DEFAULT 'text/plain' NOT NULL,
	`checksum_sha256` text NOT NULL,
	`byte_size` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workflow_id`) REFERENCES `delivery_workflows`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `delivery_runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_artifacts_workflow_key_version_uidx` ON `delivery_artifacts` (`workflow_id`,`key`,`version`);--> statement-breakpoint
CREATE INDEX `delivery_artifacts_workflow_idx` ON `delivery_artifacts` (`workflow_id`);--> statement-breakpoint
CREATE TABLE `delivery_authorizations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`workflow_id` text,
	`action` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`note` text,
	`approved_by_user_id` text,
	`approved_at` text,
	`expires_at` text,
	`consumed_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workflow_id`) REFERENCES `delivery_workflows`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`approved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `delivery_authorizations_org_idx` ON `delivery_authorizations` (`organization_id`);--> statement-breakpoint
CREATE TABLE `delivery_qa_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`workflow_id` text NOT NULL,
	`run_id` text NOT NULL,
	`check_id` text NOT NULL,
	`status` text NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`evidence_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workflow_id`) REFERENCES `delivery_workflows`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `delivery_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `delivery_qa_checks_run_idx` ON `delivery_qa_checks` (`run_id`);--> statement-breakpoint
CREATE TABLE `delivery_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`workflow_id` text NOT NULL,
	`from_version` integer NOT NULL,
	`to_version` integer NOT NULL,
	`reason` text NOT NULL,
	`created_by_user_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workflow_id`) REFERENCES `delivery_workflows`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `delivery_revisions_workflow_idx` ON `delivery_revisions` (`workflow_id`);--> statement-breakpoint
CREATE TABLE `delivery_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`workflow_id` text NOT NULL,
	`agent_kind` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`idempotency_key` text NOT NULL,
	`input_json` text DEFAULT '{}' NOT NULL,
	`result_json` text,
	`error_message` text,
	`started_at` text,
	`finished_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workflow_id`) REFERENCES `delivery_workflows`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_runs_idempotency_uidx` ON `delivery_runs` (`organization_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `delivery_runs_workflow_idx` ON `delivery_runs` (`workflow_id`);--> statement-breakpoint
CREATE TABLE `delivery_settings` (
	`id` text PRIMARY KEY DEFAULT 'global' NOT NULL,
	`runs_enabled` integer DEFAULT true NOT NULL,
	`deploy_enabled` integer DEFAULT false NOT NULL,
	`publication_enabled` integer DEFAULT false NOT NULL,
	`spending_enabled` integer DEFAULT false NOT NULL,
	`destructive_enabled` integer DEFAULT false NOT NULL,
	`allow_model_code_execution` integer DEFAULT false NOT NULL,
	`workspace_root` text DEFAULT './data/workspaces' NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `delivery_workflows` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`project_id` text NOT NULL,
	`template_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`mode` text DEFAULT 'mock' NOT NULL,
	`brief_json` text DEFAULT '{}' NOT NULL,
	`scope_json` text DEFAULT '{}' NOT NULL,
	`failure_reason` text,
	`current_version` integer DEFAULT 0 NOT NULL,
	`workspace_path` text,
	`created_by_user_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `delivery_workflows_org_idx` ON `delivery_workflows` (`organization_id`);--> statement-breakpoint
CREATE INDEX `delivery_workflows_project_idx` ON `delivery_workflows` (`project_id`);