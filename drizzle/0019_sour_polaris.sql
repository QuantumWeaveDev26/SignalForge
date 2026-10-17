CREATE TABLE `team_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`digest` text NOT NULL,
	`expires` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `team_workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_invites_digest_unique` ON `team_invites` (`digest`);--> statement-breakpoint
CREATE TABLE `team_members` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `team_workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_member_unique_idx` ON `team_members` (`workspace_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `team_member_user_idx` ON `team_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `team_workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_by` text NOT NULL,
	`created` text NOT NULL
);
