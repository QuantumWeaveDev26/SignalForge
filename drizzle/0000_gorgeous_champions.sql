CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`digest` text NOT NULL,
	`created` text NOT NULL,
	`revoked` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_digest_unique` ON `api_keys` (`digest`);--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`key` text NOT NULL,
	`bytes` integer NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`owner` text NOT NULL,
	`role` text NOT NULL,
	`body` text NOT NULL,
	`sources` text DEFAULT '[]' NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `monitors` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`input` text NOT NULL,
	`cadence` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`next_run` text NOT NULL,
	`lease_until` text,
	`last_report` text,
	`error` text DEFAULT '' NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `preferences` (
	`owner` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT 'My workspace' NOT NULL,
	`market` text DEFAULT 'Global' NOT NULL,
	`timezone` text DEFAULT 'Asia/Kolkata' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`website` text DEFAULT '' NOT NULL,
	`market` text DEFAULT 'Global' NOT NULL,
	`competitors` text DEFAULT '' NOT NULL,
	`audience` text DEFAULT '' NOT NULL,
	`context` text DEFAULT '' NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`template` text NOT NULL,
	`subject` text NOT NULL,
	`market` text NOT NULL,
	`question` text NOT NULL,
	`input` text NOT NULL,
	`status` text NOT NULL,
	`response_id` text,
	`body` text DEFAULT '' NOT NULL,
	`sources` text DEFAULT '[]' NOT NULL,
	`usage` text DEFAULT '{}' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	`share_token` text,
	`monitor_id` text
);
