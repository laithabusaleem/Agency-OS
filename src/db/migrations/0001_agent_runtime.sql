CREATE TABLE `agent_job_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`attempt_number` integer NOT NULL,
	`status` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`error_code` text,
	`error_message` text,
	`retry_after_ms` integer,
	`prompt_tokens` integer DEFAULT 0 NOT NULL,
	`completion_tokens` integer DEFAULT 0 NOT NULL,
	`latency_ms` integer,
	`cost_cents_estimate` integer DEFAULT 0 NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `agent_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_job_attempts_job_idx` ON `agent_job_attempts` (`job_id`);--> statement-breakpoint
CREATE TABLE `agent_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`created_by_user_id` text,
	`idempotency_key` text NOT NULL,
	`agent_type` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`input_json` text NOT NULL,
	`output_json` text,
	`error_json` text,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`timeout_ms` integer DEFAULT 30000 NOT NULL,
	`budget_cents` integer DEFAULT 100 NOT NULL,
	`cost_cents_estimate` integer DEFAULT 0 NOT NULL,
	`prompt_tokens` integer DEFAULT 0 NOT NULL,
	`completion_tokens` integer DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`latency_ms` integer,
	`worker_id` text,
	`locked_at` text,
	`lock_expires_at` text,
	`available_at` text DEFAULT (datetime('now')) NOT NULL,
	`started_at` text,
	`finished_at` text,
	`cancelled_at` text,
	`last_error` text,
	`dead_letter_reason` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `agent_jobs_org_idx` ON `agent_jobs` (`organization_id`);--> statement-breakpoint
CREATE INDEX `agent_jobs_status_avail_idx` ON `agent_jobs` (`status`,`available_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_jobs_idempotency_uidx` ON `agent_jobs` (`organization_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `agent_runtime_settings` (
	`id` text PRIMARY KEY DEFAULT 'global' NOT NULL,
	`kill_switch_enabled` integer DEFAULT false NOT NULL,
	`global_budget_cents` integer DEFAULT 50000 NOT NULL,
	`global_spend_cents` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `agent_usage_daily` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`day` text NOT NULL,
	`spend_cents` integer DEFAULT 0 NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_usage_daily_org_day_idx` ON `agent_usage_daily` (`organization_id`,`day`);