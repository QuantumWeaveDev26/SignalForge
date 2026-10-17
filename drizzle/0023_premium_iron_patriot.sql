CREATE TABLE `api_key_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`key_id` text NOT NULL,
	`minute` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`key_id`) REFERENCES `api_keys`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `api_key_usage_key_idx` ON `api_key_usage` (`key_id`,`minute`);--> statement-breakpoint
ALTER TABLE `api_keys` ADD `scopes` text DEFAULT '["reports","profiles"]' NOT NULL;--> statement-breakpoint
ALTER TABLE `api_keys` ADD `expires` text;