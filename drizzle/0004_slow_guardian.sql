CREATE TABLE `conversation_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`day` text NOT NULL,
	`turns` integer DEFAULT 0 NOT NULL
);
