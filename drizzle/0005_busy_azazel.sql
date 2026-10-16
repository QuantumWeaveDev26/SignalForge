CREATE TABLE `billing_checkouts` (
	`id` text PRIMARY KEY NOT NULL,
	`account` text NOT NULL,
	`mode` text NOT NULL,
	`subscription_id` text,
	`state` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `billing_events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `billing_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`account` text NOT NULL,
	`mode` text NOT NULL,
	`plan` text NOT NULL,
	`currency` text NOT NULL,
	`amount` integer NOT NULL,
	`period_start` integer NOT NULL,
	`period_end` integer NOT NULL,
	`revoked` integer DEFAULT 0 NOT NULL,
	`updated` text NOT NULL,
	FOREIGN KEY (`subscription_id`) REFERENCES `billing_subscriptions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `billing_payments_account_idx` ON `billing_payments` (`account`,`mode`,`period_end`);--> statement-breakpoint
CREATE TABLE `billing_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`account` text NOT NULL,
	`mode` text NOT NULL,
	`plan` text NOT NULL,
	`currency` text NOT NULL,
	`provider_plan` text NOT NULL,
	`status` text NOT NULL,
	`cancel_requested` integer DEFAULT 0 NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `billing_subscriptions_account_idx` ON `billing_subscriptions` (`account`,`mode`);--> statement-breakpoint
CREATE TABLE `billing_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`account` text NOT NULL,
	`period` text NOT NULL,
	`kind` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `billing_usage_period_idx` ON `billing_usage` (`account`,`period`,`kind`);