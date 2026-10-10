CREATE TABLE "account_merge_locks" (
	"user_id" text PRIMARY KEY NOT NULL,
	"operation_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_merge_notification_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation_id" uuid NOT NULL,
	"recipient_email" text,
	"recipient_name" text,
	"event" text NOT NULL,
	"locale" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_merge_notification_outbox_event_check" CHECK ("account_merge_notification_outbox"."event" IN ('merge_completed_primary', 'merge_completed_secondary', 'merge_timed_out', 'merge_failed')),
	CONSTRAINT "account_merge_notification_outbox_state_check" CHECK ("account_merge_notification_outbox"."state" IN ('pending', 'sending', 'delivered', 'failed')),
	CONSTRAINT "account_merge_notification_outbox_attempts_check" CHECK ("account_merge_notification_outbox"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "account_merge_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"link_attempt_id" uuid NOT NULL,
	"initiating_user_id" text NOT NULL,
	"target_user_id" text NOT NULL,
	"primary_user_id" text,
	"secondary_user_id" text,
	"provider_id" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"state" text DEFAULT 'created' NOT NULL,
	"confirm_not_before" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"wait_deadline" timestamp with time zone,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"status_token_hash" text NOT NULL,
	"locale" text NOT NULL,
	"source_email_masked" text,
	"source_email_digest" text,
	"failure_code" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_merge_operations_state_check" CHECK ("account_merge_operations"."state" IN ('created', 'confirmed', 'waiting', 'merging', 'completed', 'cancelled', 'expired', 'failed')),
	CONSTRAINT "account_merge_operations_locale_check" CHECK ("account_merge_operations"."locale" IN ('zh-CN', 'en-US')),
	CONSTRAINT "account_merge_operations_retry_count_check" CHECK ("account_merge_operations"."retry_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "account_social_link_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"initiating_user_id" text NOT NULL,
	"session_binding_hash" text NOT NULL,
	"token_hash" text NOT NULL,
	"provider_id" text NOT NULL,
	"provider_account_id" text,
	"state" text DEFAULT 'started' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_social_link_attempts_state_check" CHECK ("account_social_link_attempts"."state" IN ('started', 'captured', 'collision', 'consumed', 'expired', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "account_lifecycle" DROP CONSTRAINT "account_lifecycle_status_check";--> statement-breakpoint
ALTER TABLE "account_lifecycle" DROP CONSTRAINT "account_lifecycle_dates_check";--> statement-breakpoint
ALTER TABLE "pdf_export_jobs" DROP CONSTRAINT "pdf_export_jobs_resume_fk";
--> statement-breakpoint
ALTER TABLE "resume_versions" DROP CONSTRAINT "resume_versions_resume_fk";
--> statement-breakpoint
ALTER TABLE "ai_conversations" DROP CONSTRAINT "ai_conversations_resume_fk";
--> statement-breakpoint
ALTER TABLE "account_lifecycle" ADD COLUMN "merged_into_user_id" text;--> statement-breakpoint
ALTER TABLE "account_lifecycle" ADD COLUMN "merged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_merge_locks" ADD CONSTRAINT "account_merge_locks_operation_fk" FOREIGN KEY ("operation_id") REFERENCES "account_merge_operations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_merge_notification_outbox" ADD CONSTRAINT "account_merge_notification_outbox_operation_fk" FOREIGN KEY ("operation_id") REFERENCES "account_merge_operations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_merge_operations" ADD CONSTRAINT "account_merge_operations_link_attempt_fk" FOREIGN KEY ("link_attempt_id") REFERENCES "account_social_link_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_social_link_attempts" ADD CONSTRAINT "account_social_link_attempts_initiating_user_fk" FOREIGN KEY ("initiating_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_merge_operations" ADD CONSTRAINT "account_merge_operations_initiating_user_fk" FOREIGN KEY ("initiating_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_merge_operations" ADD CONSTRAINT "account_merge_operations_target_user_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_merge_operations" ADD CONSTRAINT "account_merge_operations_primary_user_fk" FOREIGN KEY ("primary_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_merge_operations" ADD CONSTRAINT "account_merge_operations_secondary_user_fk" FOREIGN KEY ("secondary_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_merge_locks" ADD CONSTRAINT "account_merge_locks_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_lifecycle" ADD CONSTRAINT "account_lifecycle_merged_into_user_fk" FOREIGN KEY ("merged_into_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_merge_locks_operation_idx" ON "account_merge_locks" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX "account_merge_locks_expiry_idx" ON "account_merge_locks" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "account_merge_notification_outbox_state_idx" ON "account_merge_notification_outbox" USING btree ("state","lease_expires_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "account_merge_operations_link_attempt_unique" ON "account_merge_operations" USING btree ("link_attempt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_merge_operations_status_token_unique" ON "account_merge_operations" USING btree ("status_token_hash");--> statement-breakpoint
CREATE INDEX "account_merge_operations_state_deadline_idx" ON "account_merge_operations" USING btree ("state","wait_deadline","lease_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "account_social_link_attempts_token_hash_unique" ON "account_social_link_attempts" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "account_social_link_attempts_user_created_idx" ON "account_social_link_attempts" USING btree ("initiating_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "account_social_link_attempts_expiry_idx" ON "account_social_link_attempts" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "pdf_export_jobs" ADD CONSTRAINT "pdf_export_jobs_resume_fk" FOREIGN KEY ("resume_user_id","resume_id") REFERENCES "resumes"("user_id","id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "resume_versions" ADD CONSTRAINT "resume_versions_resume_fk" FOREIGN KEY ("user_id","resume_id") REFERENCES "resumes"("user_id","id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_resume_fk" FOREIGN KEY ("user_id","resume_id") REFERENCES "resumes"("user_id","id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "account_lifecycle_merged_into_idx" ON "account_lifecycle" USING btree ("merged_into_user_id");--> statement-breakpoint
ALTER TABLE "account_lifecycle" ADD CONSTRAINT "account_lifecycle_status_check" CHECK ("account_lifecycle"."status" IN ('active', 'pending_deletion', 'deleted', 'merged'));--> statement-breakpoint
ALTER TABLE "account_lifecycle" ADD CONSTRAINT "account_lifecycle_dates_check" CHECK ((
            "account_lifecycle"."status" = 'active'
            AND "account_lifecycle"."deletion_requested_at" IS NULL
            AND "account_lifecycle"."deletion_due_at" IS NULL
            AND "account_lifecycle"."deleted_at" IS NULL
            AND "account_lifecycle"."merged_into_user_id" IS NULL
            AND "account_lifecycle"."merged_at" IS NULL
          ) OR (
            "account_lifecycle"."status" = 'pending_deletion'
            AND "account_lifecycle"."deletion_requested_at" IS NOT NULL
            AND "account_lifecycle"."deletion_due_at" IS NOT NULL
            AND "account_lifecycle"."deleted_at" IS NULL
            AND "account_lifecycle"."merged_into_user_id" IS NULL
            AND "account_lifecycle"."merged_at" IS NULL
          ) OR (
            "account_lifecycle"."status" = 'deleted'
            AND "account_lifecycle"."deletion_requested_at" IS NOT NULL
            AND "account_lifecycle"."deletion_due_at" IS NOT NULL
            AND "account_lifecycle"."deleted_at" IS NOT NULL
            AND "account_lifecycle"."merged_into_user_id" IS NULL
            AND "account_lifecycle"."merged_at" IS NULL
          ) OR (
            "account_lifecycle"."status" = 'merged'
            AND "account_lifecycle"."deletion_requested_at" IS NULL
            AND "account_lifecycle"."deletion_due_at" IS NULL
            AND "account_lifecycle"."deleted_at" IS NULL
            AND "account_lifecycle"."merged_into_user_id" IS NOT NULL
            AND "account_lifecycle"."merged_at" IS NOT NULL
          ));
