ALTER TABLE `attachments` ADD `original_key` text;--> statement-breakpoint
ALTER TABLE `attachments` ADD `format` text DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE `attachments` ADD `text_chars` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `attachments` ADD `sections` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `attachments` ADD `warning` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `attachments` ADD `archived` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `attachments` ADD `project_id` text REFERENCES projects(id);--> statement-breakpoint
ALTER TABLE `attachments` ADD `profile_id` text REFERENCES profiles(id);