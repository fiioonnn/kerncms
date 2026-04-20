CREATE TABLE `custom_domains` (
	`id` text PRIMARY KEY NOT NULL,
	`domain` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `custom_domains_domain_unique` ON `custom_domains` (`domain`);--> statement-breakpoint
CREATE TABLE `domain_transfer_tokens` (
	`token` text PRIMARY KEY NOT NULL,
	`session_token` text NOT NULL,
	`target_domain` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
