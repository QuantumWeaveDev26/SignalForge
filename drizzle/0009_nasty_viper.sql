ALTER TABLE `monitors` ADD `managed_profile_id` text REFERENCES profiles(id);--> statement-breakpoint
CREATE UNIQUE INDEX `monitors_managed_profile_idx` ON `monitors` (`owner`,`managed_profile_id`);--> statement-breakpoint
ALTER TABLE `preferences` ADD `monitor_all_brands` integer DEFAULT 0 NOT NULL;