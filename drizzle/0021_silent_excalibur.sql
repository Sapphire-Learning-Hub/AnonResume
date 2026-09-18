DROP INDEX "ai_provider_credentials_user_owner_unique";--> statement-breakpoint
ALTER TABLE "ai_provider_credentials" ADD COLUMN "deleted_at" timestamp with time zone;