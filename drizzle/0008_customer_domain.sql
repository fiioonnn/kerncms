ALTER TABLE "customers" ADD COLUMN "domain" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "domain_hostname_id" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "domain_status" text;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_domain_unique" UNIQUE("domain");