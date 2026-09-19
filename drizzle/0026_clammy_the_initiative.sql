CREATE TABLE "system_config_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"base_revision_id" uuid,
	"summary" text,
	"created_by_user_id" text NOT NULL,
	"published_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "system_config_revisions_status_check" CHECK ("system_config_revisions"."status" IN ('draft', 'active', 'superseded'))
);
--> statement-breakpoint
CREATE TABLE "system_config_runtime_states" (
	"instance_id" text PRIMARY KEY NOT NULL,
	"consumer" text NOT NULL,
	"release" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"desired_revision_id" uuid,
	"loaded_hot_revision_id" uuid,
	"loaded_restart_revision_id" uuid,
	"fallback_revision_id" uuid,
	"health_state" text DEFAULT 'healthy' NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"last_error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "system_config_runtime_states_consumer_check" CHECK ("system_config_runtime_states"."consumer" IN ('web', 'pdf-worker', 'ai-worker')),
	CONSTRAINT "system_config_runtime_states_health_check" CHECK ("system_config_runtime_states"."health_state" IN ('healthy', 'restart_required', 'degraded', 'recovery_required'))
);
--> statement-breakpoint
CREATE TABLE "system_config_values" (
	"revision_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value_json" jsonb,
	"encrypted_value" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "system_config_values_revision_id_key_pk" PRIMARY KEY("revision_id","key"),
	CONSTRAINT "system_config_values_payload_check" CHECK (("system_config_values"."value_json" IS NULL) <> ("system_config_values"."encrypted_value" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "system_config_runtime_states" ADD CONSTRAINT "system_config_runtime_states_desired_revision_fk" FOREIGN KEY ("desired_revision_id") REFERENCES "public"."system_config_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_config_runtime_states" ADD CONSTRAINT "system_config_runtime_states_loaded_hot_revision_fk" FOREIGN KEY ("loaded_hot_revision_id") REFERENCES "public"."system_config_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_config_runtime_states" ADD CONSTRAINT "system_config_runtime_states_loaded_restart_revision_fk" FOREIGN KEY ("loaded_restart_revision_id") REFERENCES "public"."system_config_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_config_runtime_states" ADD CONSTRAINT "system_config_runtime_states_fallback_revision_fk" FOREIGN KEY ("fallback_revision_id") REFERENCES "public"."system_config_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_config_values" ADD CONSTRAINT "system_config_values_revision_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."system_config_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "system_config_revisions_version_unique" ON "system_config_revisions" USING btree ("version");--> statement-breakpoint
CREATE UNIQUE INDEX "system_config_revisions_active_unique" ON "system_config_revisions" USING btree ("status") WHERE "system_config_revisions"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "system_config_revisions_draft_unique" ON "system_config_revisions" USING btree ("status") WHERE "system_config_revisions"."status" = 'draft';--> statement-breakpoint
CREATE INDEX "system_config_runtime_states_consumer_seen_idx" ON "system_config_runtime_states" USING btree ("consumer","last_seen_at");