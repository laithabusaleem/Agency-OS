CREATE TABLE `audit_findings` (
	`id` text PRIMARY KEY NOT NULL,
	`audit_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`kind` text NOT NULL,
	`severity` text DEFAULT 'medium' NOT NULL,
	`title` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`evidence_ids_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`audit_id`) REFERENCES `business_audits`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `audit_findings_audit_idx` ON `audit_findings` (`audit_id`);--> statement-breakpoint
CREATE TABLE `business_audits` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`lead_id` text NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`evidence_ids_json` text DEFAULT '[]' NOT NULL,
	`created_by_user_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `business_audits_org_idx` ON `business_audits` (`organization_id`);--> statement-breakpoint
CREATE INDEX `business_audits_lead_idx` ON `business_audits` (`lead_id`);--> statement-breakpoint
CREATE TABLE `follow_up_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`message_id` text NOT NULL,
	`lead_id` text,
	`due_at` text NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`stop_reason` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `outreach_messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `follow_up_schedules_due_idx` ON `follow_up_schedules` (`status`,`due_at`);--> statement-breakpoint
CREATE TABLE `outreach_campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`category` text DEFAULT 'approved_outreach' NOT NULL,
	`send_limit` integer DEFAULT 50 NOT NULL,
	`sent_count` integer DEFAULT 0 NOT NULL,
	`approval_required` integer DEFAULT true NOT NULL,
	`approved_by_user_id` text,
	`approved_at` text,
	`approval_note` text,
	`stop_reason` text,
	`created_by_user_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`approved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `outreach_campaigns_org_idx` ON `outreach_campaigns` (`organization_id`);--> statement-breakpoint
CREATE TABLE `outreach_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`send_id` text,
	`message_id` text,
	`campaign_id` text,
	`type` text NOT NULL,
	`email` text,
	`payload_json` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`send_id`) REFERENCES `outreach_sends`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`message_id`) REFERENCES `outreach_messages`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`campaign_id`) REFERENCES `outreach_campaigns`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `outreach_events_org_idx` ON `outreach_events` (`organization_id`);--> statement-breakpoint
CREATE TABLE `outreach_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`campaign_id` text,
	`lead_id` text,
	`audit_id` text,
	`type` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`subject` text NOT NULL,
	`body_text` text NOT NULL,
	`body_html` text,
	`to_email` text NOT NULL,
	`evidence_ids_json` text DEFAULT '[]' NOT NULL,
	`personalization_notes` text,
	`scheduled_for` text,
	`review_note` text,
	`created_by_user_id` text,
	`reviewed_by_user_id` text,
	`reviewed_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`campaign_id`) REFERENCES `outreach_campaigns`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`audit_id`) REFERENCES `business_audits`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `outreach_messages_org_idx` ON `outreach_messages` (`organization_id`);--> statement-breakpoint
CREATE INDEX `outreach_messages_status_idx` ON `outreach_messages` (`status`);--> statement-breakpoint
CREATE INDEX `outreach_messages_campaign_idx` ON `outreach_messages` (`campaign_id`);--> statement-breakpoint
CREATE TABLE `outreach_quota_daily` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`day` text NOT NULL,
	`sent_count` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_quota_daily_org_day_uidx` ON `outreach_quota_daily` (`organization_id`,`day`);--> statement-breakpoint
CREATE TABLE `outreach_sends` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`campaign_id` text,
	`message_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`provider` text DEFAULT 'none' NOT NULL,
	`provider_message_id` text,
	`category` text NOT NULL,
	`to_email` text NOT NULL,
	`from_email` text NOT NULL,
	`error_message` text,
	`claimed_by` text,
	`claimed_at` text,
	`sent_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`campaign_id`) REFERENCES `outreach_campaigns`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`message_id`) REFERENCES `outreach_messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_sends_idempotency_uidx` ON `outreach_sends` (`organization_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `outreach_sends_status_idx` ON `outreach_sends` (`status`);--> statement-breakpoint
CREATE TABLE `outreach_settings` (
	`id` text PRIMARY KEY DEFAULT 'global' NOT NULL,
	`sending_enabled` integer DEFAULT false NOT NULL,
	`emergency_stop` integer DEFAULT false NOT NULL,
	`daily_quota` integer DEFAULT 50 NOT NULL,
	`per_campaign_limit` integer DEFAULT 100 NOT NULL,
	`rate_limit_per_minute` integer DEFAULT 10 NOT NULL,
	`default_from_email` text,
	`default_from_name` text,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `suppression_list` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text NOT NULL,
	`reason` text NOT NULL,
	`source` text DEFAULT 'system' NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suppression_list_org_email_uidx` ON `suppression_list` (`organization_id`,`email`);