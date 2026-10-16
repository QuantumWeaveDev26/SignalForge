ALTER TABLE `conversation_turns` ADD `mode` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `conversations` ADD `project_id` text REFERENCES projects(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `conversations` ADD `persona` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `conversations` ADD `favorite` integer DEFAULT 0 NOT NULL;