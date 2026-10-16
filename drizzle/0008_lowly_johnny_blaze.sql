ALTER TABLE `reports` ADD `monitor_due` text;--> statement-breakpoint
CREATE UNIQUE INDEX `reports_monitor_occurrence_idx` ON `reports` (`owner`,`monitor_id`,`monitor_due`);