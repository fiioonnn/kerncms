CREATE TABLE `project_analytics` (
	`project_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`site_id` text NOT NULL,
	`events_url` text,
	`layout_file` text,
	`daily_salt` text NOT NULL,
	`salt_rotated_at` integer NOT NULL,
	`track_pageviews` integer DEFAULT true NOT NULL,
	`track_unique` integer DEFAULT true NOT NULL,
	`track_clicks` integer DEFAULT true NOT NULL,
	`track_scroll` integer DEFAULT true NOT NULL,
	`track_events` integer DEFAULT true NOT NULL,
	`track_errors` integer DEFAULT true NOT NULL,
	`custom_events` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_analytics_site_id_unique` ON `project_analytics` (`site_id`);