CREATE TABLE `agencies` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`data` text NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `agencies_owner_idx` ON `agencies` (`owner`);--> statement-breakpoint
CREATE TABLE `pitch_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`pitch_id` text NOT NULL,
	`snapshot` text NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`pitch_id`) REFERENCES `pitches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pitch_runs_pitch_idx` ON `pitch_runs` (`owner`,`pitch_id`);--> statement-breakpoint
CREATE TABLE `pitch_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`pitch_id` text NOT NULL,
	`revision` integer NOT NULL,
	`body` text NOT NULL,
	`sources` text NOT NULL,
	`label` text NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`pitch_id`) REFERENCES `pitches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pitch_versions_revision_idx` ON `pitch_versions` (`pitch_id`,`revision`);--> statement-breakpoint
CREATE TABLE `pitches` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`input` text NOT NULL,
	`agency` text DEFAULT 'null' NOT NULL,
	`body` text NOT NULL,
	`sources` text DEFAULT '[]' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`project_id` text,
	`profile_id` text,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `pitches_owner_idx` ON `pitches` (`owner`,`updated`);