CREATE TABLE "media_cleanup" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"location" text NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"released_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "site_storage" (
	"site_id" uuid PRIMARY KEY NOT NULL,
	"endpoint" text DEFAULT '' NOT NULL,
	"region" text DEFAULT 'auto' NOT NULL,
	"bucket" text NOT NULL,
	"access_key_id" text NOT NULL,
	"secret_access_key" text NOT NULL,
	"public_url" text NOT NULL,
	"prefix" text DEFAULT '' NOT NULL,
	"force_path_style" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "location" text DEFAULT 'repo' NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "url" text;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "size" integer;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "width" integer;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "height" integer;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "media_storage" text DEFAULT 'repo' NOT NULL;--> statement-breakpoint
ALTER TABLE "media_cleanup" ADD CONSTRAINT "media_cleanup_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_storage" ADD CONSTRAINT "site_storage_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;