DROP INDEX "ai_models_provider_key_unique";--> statement-breakpoint
ALTER TABLE "ai_models" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_models_provider_key_unique" ON "ai_models" USING btree ("provider_id","provider_model_key") WHERE "ai_models"."deleted_at" IS NULL;