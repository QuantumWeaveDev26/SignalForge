CREATE TABLE `client_portals` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `client_portals_owner_idx` ON `client_portals` (`owner`);--> statement-breakpoint
CREATE TABLE `portal_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`grant_id` text NOT NULL,
	`actor` text NOT NULL,
	`author` text NOT NULL,
	`body` text NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `portal_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`grant_id`) REFERENCES `portal_grants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `portal_comments_thread_idx` ON `portal_comments` (`grant_id`,`item_id`,`created`);--> statement-breakpoint
CREATE TABLE `portal_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`portal_id` text NOT NULL,
	`email` text NOT NULL,
	`user_id` text,
	`can_comment` integer DEFAULT 0 NOT NULL,
	`can_download` integer DEFAULT 0 NOT NULL,
	`digest` text NOT NULL,
	`expires` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`portal_id`) REFERENCES `client_portals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portal_grants_digest_unique` ON `portal_grants` (`digest`);--> statement-breakpoint
CREATE INDEX `portal_grants_user_idx` ON `portal_grants` (`user_id`,`email`);--> statement-breakpoint
CREATE INDEX `portal_grants_portal_idx` ON `portal_grants` (`portal_id`);--> statement-breakpoint
CREATE TABLE `portal_items` (
	`id` text PRIMARY KEY NOT NULL,
	`portal_id` text NOT NULL,
	`source_id` text NOT NULL,
	`title` text NOT NULL,
	`snapshot` text NOT NULL,
	`withdrawn` integer DEFAULT 0 NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`portal_id`) REFERENCES `client_portals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `portal_items_portal_idx` ON `portal_items` (`portal_id`);