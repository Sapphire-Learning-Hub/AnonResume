CREATE TABLE "account_email_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"purpose" text NOT NULL,
	"email_hash" text NOT NULL,
	"binding_hash" text,
	"code_hash" text NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"resend_available_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"invalidated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_email_challenges_purpose_check" CHECK ("account_email_challenges"."purpose" IN ('change_email_old', 'change_email_new', 'delete_account', 'restore_account')),
	CONSTRAINT "account_email_challenges_failed_attempts_check" CHECK ("account_email_challenges"."failed_attempts" >= 0 AND "account_email_challenges"."failed_attempts" <= 5)
);
--> statement-breakpoint
CREATE TABLE "account_lifecycle" (
	"user_id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"deletion_requested_at" timestamp with time zone,
	"deletion_due_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_lifecycle_status_check" CHECK ("account_lifecycle"."status" IN ('active', 'pending_deletion', 'deleted')),
	CONSTRAINT "account_lifecycle_dates_check" CHECK ((
            "account_lifecycle"."status" = 'active'
            AND "account_lifecycle"."deletion_requested_at" IS NULL
            AND "account_lifecycle"."deletion_due_at" IS NULL
            AND "account_lifecycle"."deleted_at" IS NULL
          ) OR (
            "account_lifecycle"."status" = 'pending_deletion'
            AND "account_lifecycle"."deletion_requested_at" IS NOT NULL
            AND "account_lifecycle"."deletion_due_at" IS NOT NULL
            AND "account_lifecycle"."deleted_at" IS NULL
          ) OR (
            "account_lifecycle"."status" = 'deleted'
            AND "account_lifecycle"."deletion_requested_at" IS NOT NULL
            AND "account_lifecycle"."deletion_due_at" IS NOT NULL
            AND "account_lifecycle"."deleted_at" IS NOT NULL
          ))
);
--> statement-breakpoint
CREATE INDEX "account_email_challenges_user_purpose_idx" ON "account_email_challenges" USING btree ("user_id","purpose","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "account_email_challenges_expiry_idx" ON "account_email_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "account_lifecycle_status_due_idx" ON "account_lifecycle" USING btree ("status","deletion_due_at");