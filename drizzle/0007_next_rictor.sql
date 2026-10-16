CREATE TABLE `background_events` (
	`id` text PRIMARY KEY NOT NULL,
	`response_id` text NOT NULL,
	`type` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`lease_until` text,
	`error` text DEFAULT '' NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `workflow_runs` ADD `background_enabled` integer DEFAULT 0 NOT NULL;