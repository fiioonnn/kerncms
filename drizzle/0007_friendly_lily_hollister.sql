CREATE TABLE `project_screenshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`path` text NOT NULL,
	`path_hash` text NOT NULL,
	`width` integer,
	`height` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`captured_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_screenshots_project_hash` ON `project_screenshots` (`project_id`,`path_hash`);