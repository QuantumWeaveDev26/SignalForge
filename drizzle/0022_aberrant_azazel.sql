CREATE TABLE `pitch_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`pitch_id` text NOT NULL,
	`revision` integer NOT NULL,
	`actor` text NOT NULL,
	`author` text NOT NULL,
	`decision` text NOT NULL,
	`body` text NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`pitch_id`) REFERENCES `pitches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pitch_reviews_pitch_idx` ON `pitch_reviews` (`owner`,`pitch_id`,`created`);