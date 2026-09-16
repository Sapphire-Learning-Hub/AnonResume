ALTER TABLE "ai_usage_ledger" DROP CONSTRAINT "ai_usage_ledger_run_fk";
--> statement-breakpoint
ALTER TABLE "ai_usage_ledger" DROP CONSTRAINT "ai_usage_ledger_model_fk";
--> statement-breakpoint
ALTER TABLE "ai_usage_ledger" ADD CONSTRAINT "ai_usage_ledger_run_fk" FOREIGN KEY ("run_id") REFERENCES "ai_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_ledger" ADD CONSTRAINT "ai_usage_ledger_model_fk" FOREIGN KEY ("model_id") REFERENCES "ai_models"("id") ON DELETE set null ON UPDATE no action;
