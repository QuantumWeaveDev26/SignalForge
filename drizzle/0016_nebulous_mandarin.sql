ALTER TABLE `preferences` ADD `selected_profile_id` text REFERENCES profiles(id) ON DELETE SET NULL;
