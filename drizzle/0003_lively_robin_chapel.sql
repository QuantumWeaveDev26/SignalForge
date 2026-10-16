CREATE TABLE `catalog_favorites` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`preset_id` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `catalog_favorites_owner_idx` ON `catalog_favorites` (`owner`);--> statement-breakpoint
CREATE TABLE `conversation_turns` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`conversation_id` text NOT NULL,
	`request_id` text NOT NULL,
	`question` text NOT NULL,
	`attachments` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'starting' NOT NULL,
	`response_id` text,
	`body` text DEFAULT '' NOT NULL,
	`sources` text DEFAULT '[]' NOT NULL,
	`usage` text DEFAULT '{}' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conversation_turns_owner_idx` ON `conversation_turns` (`owner`,`conversation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_turns_request_idx` ON `conversation_turns` (`owner`,`request_id`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`profile_id` text,
	`mode` text DEFAULT 'strategy' NOT NULL,
	`context` text DEFAULT '{}' NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `conversations_owner_idx` ON `conversations` (`owner`,`updated`);