CREATE TABLE "ai_audit_payloads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"encrypted_request" bytea NOT NULL,
	"encrypted_response" bytea,
	"encryption_key_version" integer DEFAULT 1 NOT NULL,
	"payload_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"resume_id" text NOT NULL,
	"title" text NOT NULL,
	"context_scope" text NOT NULL,
	"section_id" text,
	"model_id" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_conversations_scope_check" CHECK (("ai_conversations"."context_scope" = 'resume' AND "ai_conversations"."section_id" IS NULL) OR ("ai_conversations"."context_scope" = 'section' AND "ai_conversations"."section_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"sequence" integer NOT NULL,
	"completion_state" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_messages_role_check" CHECK ("ai_messages"."role" IN ('user', 'assistant')),
	CONSTRAINT "ai_messages_completion_check" CHECK ("ai_messages"."completion_state" IN ('streaming', 'complete', 'stopped', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "ai_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"provider_model_key" text NOT NULL,
	"display_name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"supports_streaming" boolean DEFAULT true NOT NULL,
	"supports_tool_calls" boolean DEFAULT false NOT NULL,
	"context_window" integer NOT NULL,
	"max_output_tokens" integer NOT NULL,
	"input_point_rate" bigint NOT NULL,
	"cached_input_point_rate" bigint NOT NULL,
	"output_point_rate" bigint NOT NULL,
	"rate_card_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_models_limits_check" CHECK ("ai_models"."context_window" > 0 AND "ai_models"."max_output_tokens" > 0),
	CONSTRAINT "ai_models_rates_check" CHECK ("ai_models"."input_point_rate" >= 0 AND "ai_models"."cached_input_point_rate" >= 0 AND "ai_models"."output_point_rate" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ai_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"base_resume_version" integer NOT NULL,
	"target_hashes" jsonb NOT NULL,
	"proposal" jsonb NOT NULL,
	"completion_state" text NOT NULL,
	"applied_change_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_proposals_completion_check" CHECK ("ai_proposals"."completion_state" IN ('complete', 'incomplete', 'invalid'))
);
--> statement-breakpoint
CREATE TABLE "ai_provider_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text,
	"kind" text NOT NULL,
	"display_name" text NOT NULL,
	"base_url" text NOT NULL,
	"encrypted_api_key" bytea NOT NULL,
	"encryption_key_version" integer DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_provider_credentials_kind_check" CHECK ("ai_provider_credentials"."kind" IN ('platform', 'user')),
	CONSTRAINT "ai_provider_credentials_owner_check" CHECK (("ai_provider_credentials"."kind" = 'platform' AND "ai_provider_credentials"."owner_user_id" IS NULL) OR ("ai_provider_credentials"."kind" = 'user' AND "ai_provider_credentials"."owner_user_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "ai_quota_accounts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"monthly_limit" bigint NOT NULL,
	"period_started_at" timestamp with time zone NOT NULL,
	"period_ends_at" timestamp with time zone NOT NULL,
	"used_points" bigint DEFAULT 0 NOT NULL,
	"reserved_points" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_quota_accounts_period_check" CHECK ("ai_quota_accounts"."period_ends_at" > "ai_quota_accounts"."period_started_at"),
	CONSTRAINT "ai_quota_accounts_points_check" CHECK ("ai_quota_accounts"."monthly_limit" >= 0 AND "ai_quota_accounts"."used_points" >= 0 AND "ai_quota_accounts"."reserved_points" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ai_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"resume_id" text NOT NULL,
	"conversation_id" uuid NOT NULL,
	"assistant_message_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"key_source" text NOT NULL,
	"status" text NOT NULL,
	"resume_version" integer NOT NULL,
	"context_hash" text NOT NULL,
	"prompt_version" integer NOT NULL,
	"provider_request_id" text,
	"checkpoint_sequence" integer DEFAULT 0 NOT NULL,
	"checkpoint_text" text DEFAULT '' NOT NULL,
	"checkpoint_proposal" jsonb,
	"input_tokens" integer,
	"cached_input_tokens" integer,
	"output_tokens" integer,
	"reserved_points" bigint DEFAULT 0 NOT NULL,
	"final_points" bigint,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"stop_requested_at" timestamp with time zone,
	"failure_code" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_runs_status_check" CHECK ("ai_runs"."status" IN ('preparing', 'streaming', 'complete', 'stopped', 'failed', 'interrupted', 'settlement_pending')),
	CONSTRAINT "ai_runs_points_check" CHECK ("ai_runs"."reserved_points" >= 0 AND ("ai_runs"."final_points" IS NULL OR "ai_runs"."final_points" >= 0))
);
--> statement-breakpoint
CREATE TABLE "ai_usage_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"run_id" uuid,
	"entry_type" text NOT NULL,
	"points_delta" bigint NOT NULL,
	"input_tokens" integer,
	"cached_input_tokens" integer,
	"output_tokens" integer,
	"model_id" uuid,
	"rate_card_version" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_usage_ledger_type_check" CHECK ("ai_usage_ledger"."entry_type" IN ('renewal', 'adjustment', 'reserve', 'settlement', 'release'))
);
--> statement-breakpoint
ALTER TABLE "ai_audit_payloads" ADD CONSTRAINT "ai_audit_payloads_run_fk" FOREIGN KEY ("run_id") REFERENCES "ai_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_resume_fk" FOREIGN KEY ("user_id","resume_id") REFERENCES "resumes"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_model_fk" FOREIGN KEY ("model_id") REFERENCES "ai_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_fk" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_models" ADD CONSTRAINT "ai_models_provider_fk" FOREIGN KEY ("provider_id") REFERENCES "ai_provider_credentials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_proposals" ADD CONSTRAINT "ai_proposals_run_fk" FOREIGN KEY ("run_id") REFERENCES "ai_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_conversation_fk" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_message_fk" FOREIGN KEY ("assistant_message_id") REFERENCES "ai_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_model_fk" FOREIGN KEY ("model_id") REFERENCES "ai_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_ledger" ADD CONSTRAINT "ai_usage_ledger_run_fk" FOREIGN KEY ("run_id") REFERENCES "ai_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_ledger" ADD CONSTRAINT "ai_usage_ledger_model_fk" FOREIGN KEY ("model_id") REFERENCES "ai_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_audit_payloads_run_unique" ON "ai_audit_payloads" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "ai_audit_payloads_expiry_idx" ON "ai_audit_payloads" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "ai_conversations_user_resume_updated_idx" ON "ai_conversations" USING btree ("user_id","resume_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "ai_messages_conversation_sequence_unique" ON "ai_messages" USING btree ("conversation_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_models_provider_key_unique" ON "ai_models" USING btree ("provider_id","provider_model_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_proposals_run_unique" ON "ai_proposals" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "ai_provider_credentials_owner_idx" ON "ai_provider_credentials" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_runs_active_user_resume_unique" ON "ai_runs" USING btree ("user_id","resume_id") WHERE "ai_runs"."status" IN ('preparing', 'streaming');--> statement-breakpoint
CREATE INDEX "ai_runs_status_lease_idx" ON "ai_runs" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE INDEX "ai_usage_ledger_user_created_idx" ON "ai_usage_ledger" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_usage_ledger_run_idx" ON "ai_usage_ledger" USING btree ("run_id");
