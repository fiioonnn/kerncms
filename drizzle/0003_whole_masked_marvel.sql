CREATE TABLE "form_settings" (
	"site_id" uuid NOT NULL,
	"form" text NOT NULL,
	"notify" boolean DEFAULT false NOT NULL,
	"recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"confirm" boolean DEFAULT false NOT NULL,
	"confirm_subject" text DEFAULT '' NOT NULL,
	"confirm_text" text DEFAULT '' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "form_settings_site_id_form_pk" PRIMARY KEY("site_id","form")
);
--> statement-breakpoint
CREATE TABLE "site_mail" (
	"site_id" uuid PRIMARY KEY NOT NULL,
	"host" text NOT NULL,
	"port" integer DEFAULT 587 NOT NULL,
	"secure" boolean DEFAULT false NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"from_name" text DEFAULT '' NOT NULL,
	"from_email" text NOT NULL,
	"last_test_at" timestamp,
	"last_test_ok" boolean,
	"last_error" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "form_submissions" ADD COLUMN "mail_status" text;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD COLUMN "mail_error" text;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD COLUMN "mailed_at" timestamp;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "public_key" text DEFAULT 'pk_' || substr(md5(random()::text || clock_timestamp()::text), 1, 20) NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "allowed_origins" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "form_settings" ADD CONSTRAINT "form_settings_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_mail" ADD CONSTRAINT "site_mail_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_publicKey_unique" UNIQUE("public_key");