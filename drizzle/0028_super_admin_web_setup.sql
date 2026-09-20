CREATE TABLE "instance_setup_claim_limits" (
	"source_hash" text PRIMARY KEY NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instance_setup_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"generation" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instance_setup_state" (
	"slot" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"state" text NOT NULL,
	"target_user_id" text,
	"recovery_reason" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instance_setup_state_slot_check" CHECK ("instance_setup_state"."slot" = 1),
	CONSTRAINT "instance_setup_state_value_check" CHECK ("instance_setup_state"."state" IN ('pending_initialization', 'pending_admin_recovery', 'completed'))
);
--> statement-breakpoint
CREATE TABLE "instance_setup_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_instance_id" text NOT NULL,
	"generation" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "instance_setup_claim_limits_expiry_idx" ON "instance_setup_claim_limits" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "instance_setup_sessions_hash_unique" ON "instance_setup_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "instance_setup_sessions_generation_idx" ON "instance_setup_sessions" USING btree ("generation");--> statement-breakpoint
CREATE INDEX "instance_setup_sessions_expiry_idx" ON "instance_setup_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "instance_setup_tokens_source_unique" ON "instance_setup_tokens" USING btree ("source_instance_id");--> statement-breakpoint
CREATE UNIQUE INDEX "instance_setup_tokens_hash_unique" ON "instance_setup_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "instance_setup_tokens_expiry_idx" ON "instance_setup_tokens" USING btree ("expires_at");--> statement-breakpoint
INSERT INTO "instance_setup_state" ("slot", "state", "completed_at", "updated_at")
SELECT
	1,
	CASE WHEN EXISTS (
		SELECT 1 FROM "admin_principals" WHERE "kind" = 'super_admin'
	) THEN 'completed' ELSE 'pending_initialization' END,
	CASE WHEN EXISTS (
		SELECT 1 FROM "admin_principals" WHERE "kind" = 'super_admin'
	) THEN now() ELSE NULL END,
	now();
