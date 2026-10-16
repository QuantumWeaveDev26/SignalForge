CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`profile_id` text,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `projects_owner_idx` ON `projects` (`owner`);--> statement-breakpoint
CREATE TABLE `workflow_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`workflow_id` text,
	`project_id` text,
	`profile_id` text,
	`input` text NOT NULL,
	`steps` text NOT NULL,
	`reports` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'ready' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`lease_until` text,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `workflow_runs_owner_idx` ON `workflow_runs` (`owner`);--> statement-breakpoint
CREATE TABLE `workflows` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`input` text NOT NULL,
	`steps` text NOT NULL,
	`favorite` integer DEFAULT 0 NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `workflows_owner_idx` ON `workflows` (`owner`);--> statement-breakpoint
ALTER TABLE `reports` ADD `project_id` text REFERENCES projects(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `reports` ADD `profile_id` text REFERENCES profiles(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `reports` ADD `workflow_run_id` text REFERENCES workflow_runs(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `reports` ADD `workflow_step` integer;--> statement-breakpoint
ALTER TABLE `reports` ADD `favorite` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `reports` ADD `labels` text DEFAULT '[]' NOT NULL;