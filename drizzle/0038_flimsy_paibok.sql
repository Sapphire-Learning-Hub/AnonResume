CREATE TABLE "system_restart_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deployment_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"desired_revision_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"error_code" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "system_restart_operations_status_check" CHECK ("system_restart_operations"."status" IN ('queued', 'running', 'succeeded', 'failed', 'timed_out'))
);
--> statement-breakpoint
CREATE TABLE "system_restart_targets" (
	"operation_id" uuid NOT NULL,
	"instance_id" text NOT NULL,
	"consumer" text NOT NULL,
	"sequence" integer NOT NULL,
	"expected_session_id" text NOT NULL,
	"desired_restart_revision_id" uuid NOT NULL,
	"supervisor_kind" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"error_code" text,
	"drain_started_at" timestamp with time zone,
	"exit_started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "system_restart_targets_operation_id_instance_id_pk" PRIMARY KEY("operation_id","instance_id"),
	CONSTRAINT "system_restart_targets_consumer_check" CHECK ("system_restart_targets"."consumer" IN ('web', 'pdf-worker', 'ai-worker')),
	CONSTRAINT "system_restart_targets_supervisor_check" CHECK ("system_restart_targets"."supervisor_kind" IN ('docker-compose', 'systemd')),
	CONSTRAINT "system_restart_targets_status_check" CHECK ("system_restart_targets"."status" IN ('queued', 'draining', 'exiting', 'awaiting_startup', 'healthy', 'failed', 'timed_out')),
	CONSTRAINT "system_restart_targets_sequence_check" CHECK ("system_restart_targets"."sequence" >= 0)
);
--> statement-breakpoint
ALTER TABLE "system_restart_operations" ADD CONSTRAINT "system_restart_operations_desired_revision_fk" FOREIGN KEY ("desired_revision_id") REFERENCES "system_config_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_restart_targets" ADD CONSTRAINT "system_restart_targets_operation_fk" FOREIGN KEY ("operation_id") REFERENCES "system_restart_operations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_restart_targets" ADD CONSTRAINT "system_restart_targets_desired_revision_fk" FOREIGN KEY ("desired_restart_revision_id") REFERENCES "system_config_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "system_restart_operations_actor_idempotency_unique" ON "system_restart_operations" USING btree ("actor_user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "system_restart_operations_deployment_active_unique" ON "system_restart_operations" USING btree ("deployment_id") WHERE "system_restart_operations"."status" IN ('queued', 'running');--> statement-breakpoint
CREATE INDEX "system_restart_operations_deployment_created_idx" ON "system_restart_operations" USING btree ("deployment_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "system_restart_targets_operation_sequence_unique" ON "system_restart_targets" USING btree ("operation_id","sequence");
