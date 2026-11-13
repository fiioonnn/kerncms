CREATE TABLE "ai_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"provider" text DEFAULT 'anthropic' NOT NULL,
	"model" text DEFAULT 'claude-opus-5-5' NOT NULL,
	"anthropic_key" text,
	"openai_key" text,
	"access" text DEFAULT 'app_admin' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
