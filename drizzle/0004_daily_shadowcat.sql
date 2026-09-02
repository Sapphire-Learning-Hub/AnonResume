CREATE TABLE "pdf_export_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resume_user_id" text NOT NULL,
	"resume_id" text NOT NULL,
	"requester_user_id" text,
	"access_token_hash" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"document" jsonb NOT NULL,
	"filename" text NOT NULL,
	"result" bytea,
	"error" text,
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"worker_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"result_expires_at" timestamp with time zone,
	CONSTRAINT "pdf_export_jobs_status_check" CHECK ("pdf_export_jobs"."status" IN ('queued', 'running', 'completed', 'failed', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "pdf_export_jobs" ADD CONSTRAINT "pdf_export_jobs_resume_fk" FOREIGN KEY ("resume_user_id","resume_id") REFERENCES "resumes"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pdf_export_jobs_status_created_at_idx" ON "pdf_export_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "pdf_export_jobs_requester_created_at_idx" ON "pdf_export_jobs" USING btree ("requester_user_id","created_at");--> statement-breakpoint
ALTER TABLE "resume_versions" ADD CONSTRAINT "resume_versions_resume_fk" FOREIGN KEY ("user_id","resume_id") REFERENCES "resumes"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "resumes_slug_unique" ON "resumes" USING btree ("slug");
