CREATE TABLE "admin_mfa_reset_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_user_id" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewer_user_id" text,
	"review_reason" text,
	"expires_at" timestamp with time zone NOT NULL,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_mfa_reset_requests_status_check" CHECK ("admin_mfa_reset_requests"."status" IN ('pending', 'approved', 'rejected', 'cancelled', 'expired'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "admin_mfa_reset_requests_requester_pending_unique" ON "admin_mfa_reset_requests" USING btree ("requester_user_id") WHERE "admin_mfa_reset_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "admin_mfa_reset_requests_status_created_idx" ON "admin_mfa_reset_requests" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "admin_mfa_reset_requests_requester_created_idx" ON "admin_mfa_reset_requests" USING btree ("requester_user_id","created_at" DESC NULLS LAST);