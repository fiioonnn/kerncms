CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"target" text NOT NULL,
	"path" text NOT NULL,
	"visitor" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_salts" (
	"day" text PRIMARY KEY NOT NULL,
	"salt" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "page_views" ADD COLUMN "os" text;--> statement-breakpoint
ALTER TABLE "page_views" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "page_views" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "page_views" ADD COLUMN "utm_source" text;--> statement-breakpoint
ALTER TABLE "page_views" ADD COLUMN "utm_medium" text;--> statement-breakpoint
ALTER TABLE "page_views" ADD COLUMN "utm_campaign" text;--> statement-breakpoint
ALTER TABLE "page_views" ADD COLUMN "ip" text;--> statement-breakpoint
ALTER TABLE "page_views" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "page_views" ADD COLUMN "session" text;--> statement-breakpoint
ALTER TABLE "page_views" ADD COLUMN "duration" integer;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "analytics_personal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_events_site_id_created_at_index" ON "analytics_events" USING btree ("site_id","created_at");--> statement-breakpoint
CREATE INDEX "page_views_site_id_visitor_created_at_index" ON "page_views" USING btree ("site_id","visitor","created_at");