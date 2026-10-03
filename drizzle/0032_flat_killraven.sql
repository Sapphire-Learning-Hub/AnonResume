ALTER TABLE "ai_models" ADD COLUMN "connection_timeout_seconds" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_models" ADD COLUMN "first_chunk_timeout_seconds" integer DEFAULT 300 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_models" ADD COLUMN "stream_idle_timeout_seconds" integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_models" ADD COLUMN "total_timeout_seconds" integer DEFAULT 600 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_models" ADD CONSTRAINT "ai_models_timeout_limits_check" CHECK ("ai_models"."connection_timeout_seconds" BETWEEN 1 AND 120
            AND "ai_models"."first_chunk_timeout_seconds" BETWEEN 1 AND 600
            AND "ai_models"."stream_idle_timeout_seconds" BETWEEN 1 AND 300
            AND "ai_models"."total_timeout_seconds" BETWEEN 10 AND 1800
            AND "ai_models"."total_timeout_seconds" >= "ai_models"."connection_timeout_seconds"
            AND "ai_models"."total_timeout_seconds" >= "ai_models"."first_chunk_timeout_seconds"
            AND "ai_models"."total_timeout_seconds" >= "ai_models"."stream_idle_timeout_seconds");