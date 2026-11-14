CREATE TABLE "google_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"service_account" text,
	"email" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_keywords" (
	"site_id" uuid NOT NULL,
	"page" text NOT NULL,
	"keyword" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "seo_keywords_site_id_page_pk" PRIMARY KEY("site_id","page")
);
--> statement-breakpoint
ALTER TABLE "seo_keywords" ADD CONSTRAINT "seo_keywords_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;