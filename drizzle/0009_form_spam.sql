ALTER TABLE "form_submissions" ADD COLUMN "spam" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD COLUMN "spam_reason" text;