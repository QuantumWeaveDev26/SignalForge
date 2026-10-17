CREATE TABLE `profile_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`profile_id` text NOT NULL,
	`revision` integer NOT NULL,
	`data` text NOT NULL,
	`archived_at` text NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profile_versions_revision_idx` ON `profile_versions` (`profile_id`,`revision`);--> statement-breakpoint
CREATE INDEX `profile_versions_owner_idx` ON `profile_versions` (`owner`,`profile_id`);