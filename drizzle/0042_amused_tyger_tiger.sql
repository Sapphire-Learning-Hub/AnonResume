ALTER TABLE "pdf_export_jobs" ADD COLUMN "diagnostic_context" jsonb;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD COLUMN "diagnostic_context" jsonb;