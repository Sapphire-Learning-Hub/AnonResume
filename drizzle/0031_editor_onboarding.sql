CREATE TABLE "onboarding_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"flow_key" text NOT NULL,
	"flow_version" integer NOT NULL,
	"source" text NOT NULL,
	"trigger_key" text NOT NULL,
	"resume_id" text,
	"status" text NOT NULL,
	"current_step" text NOT NULL,
	"auto_opened_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_runs_source_check" CHECK ("onboarding_runs"."source" IN ('automatic', 'manual', 'development')),
	CONSTRAINT "onboarding_runs_status_check" CHECK ("onboarding_runs"."status" IN ('active', 'paused', 'completed', 'dismissed', 'ineligible'))
);
--> statement-breakpoint
ALTER TABLE "resumes" ADD COLUMN "kind" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding_runs" ADD CONSTRAINT "onboarding_runs_resume_fk" FOREIGN KEY ("resume_id") REFERENCES "resumes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_runs_user_trigger_unique" ON "onboarding_runs" USING btree ("user_id","trigger_key");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_runs_user_active_unique" ON "onboarding_runs" USING btree ("user_id") WHERE "onboarding_runs"."status" IN ('active', 'paused');--> statement-breakpoint
CREATE INDEX "onboarding_runs_user_status_idx" ON "onboarding_runs" USING btree ("user_id","status");--> statement-breakpoint
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_kind_check" CHECK ("resumes"."kind" IN ('standard', 'onboarding'));
