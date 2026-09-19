ALTER TABLE "ai_runs" DROP CONSTRAINT "ai_runs_status_check";--> statement-breakpoint
DROP INDEX "ai_runs_active_user_resume_unique";--> statement-breakpoint
ALTER TABLE "ai_runs" ADD COLUMN "checkpoint_changes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD COLUMN "encrypted_execution_payload" "bytea";--> statement-breakpoint
ALTER TABLE "ai_runs" ADD COLUMN "execution_payload_key_version" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_runs_active_user_resume_unique" ON "ai_runs" USING btree ("user_id","resume_id") WHERE "ai_runs"."status" IN ('queued', 'preparing', 'streaming');--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_execution_payload_check" CHECK (("ai_runs"."encrypted_execution_payload" IS NULL AND "ai_runs"."execution_payload_key_version" IS NULL) OR ("ai_runs"."encrypted_execution_payload" IS NOT NULL AND "ai_runs"."execution_payload_key_version" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_status_check" CHECK ("ai_runs"."status" IN ('queued', 'preparing', 'streaming', 'complete', 'stopped', 'failed', 'interrupted', 'settlement_pending'));