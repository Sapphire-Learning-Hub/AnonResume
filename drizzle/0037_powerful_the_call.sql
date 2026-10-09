CREATE TABLE "account_social_registration_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"provider_id" text NOT NULL,
	"provider_account_id" text,
	"provider_email" text,
	"provider_email_verified" boolean DEFAULT false NOT NULL,
	"selected_email" text,
	"display_name" text,
	"avatar_url" text,
	"state" text DEFAULT 'started' NOT NULL,
	"email_code_hash" text,
	"email_code_expires_at" timestamp with time zone,
	"email_code_sent_at" timestamp with time zone,
	"email_code_attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_social_registration_attempts_provider_check" CHECK ("account_social_registration_attempts"."provider_id" IN ('github')),
	CONSTRAINT "account_social_registration_attempts_state_check" CHECK ("account_social_registration_attempts"."state" IN ('started', 'profile_captured', 'email_pending', 'email_verified', 'completed', 'expired', 'cancelled')),
	CONSTRAINT "account_social_registration_attempts_email_attempts_check" CHECK ("account_social_registration_attempts"."email_code_attempts" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "account_social_registration_attempts_token_hash_unique" ON "account_social_registration_attempts" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "account_social_registration_attempts_provider_subject_idx" ON "account_social_registration_attempts" USING btree ("provider_id","provider_account_id");--> statement-breakpoint
CREATE INDEX "account_social_registration_attempts_expiry_idx" ON "account_social_registration_attempts" USING btree ("expires_at");