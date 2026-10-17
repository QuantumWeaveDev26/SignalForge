CREATE TABLE `mail_delivery_health` (
	`id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`checked` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `monitor_email_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`user_id` text NOT NULL,
	`recipient` text NOT NULL,
	`report_id` text,
	`monitor_id` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt` text NOT NULL,
	`lease_until` text,
	`provider_id` text,
	`error` text DEFAULT '' NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `monitor_email_report_idx` ON `monitor_email_outbox` (`report_id`);--> statement-breakpoint
CREATE INDEX `monitor_email_due_idx` ON `monitor_email_outbox` (`state`,`next_attempt`);--> statement-breakpoint
CREATE INDEX `monitor_email_owner_idx` ON `monitor_email_outbox` (`owner`,`created`);--> statement-breakpoint
CREATE TABLE `monitor_email_settings` (
	`owner` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`enabled_at` text NOT NULL,
	`test_at` text,
	`updated` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `auth_user`(`id`) ON UPDATE no action ON DELETE no action
);
