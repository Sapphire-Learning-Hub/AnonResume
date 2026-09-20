ALTER TABLE "worker_heartbeats" ADD COLUMN "session_id" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "worker_heartbeats" ALTER COLUMN "session_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "worker_heartbeats" ADD COLUMN "status" text DEFAULT 'running' NOT NULL;--> statement-breakpoint
ALTER TABLE "worker_heartbeats" ADD COLUMN "stopped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "system_config_runtime_states" ADD COLUMN "session_id" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "system_config_runtime_states" ALTER COLUMN "session_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "system_config_runtime_states" ADD COLUMN "status" text DEFAULT 'running' NOT NULL;--> statement-breakpoint
ALTER TABLE "system_config_runtime_states" ADD COLUMN "stopped_at" timestamp with time zone;--> statement-breakpoint
DELETE FROM "worker_heartbeats" WHERE "last_seen_at" < now() - interval '30 days';--> statement-breakpoint
DELETE FROM "system_config_runtime_states" WHERE "last_seen_at" < now() - interval '30 days';--> statement-breakpoint
ALTER TABLE "worker_heartbeats" ADD CONSTRAINT "worker_heartbeats_status_check" CHECK ("worker_heartbeats"."status" IN ('running', 'stopped'));--> statement-breakpoint
ALTER TABLE "system_config_runtime_states" ADD CONSTRAINT "system_config_runtime_states_status_check" CHECK ("system_config_runtime_states"."status" IN ('running', 'stopped'));
