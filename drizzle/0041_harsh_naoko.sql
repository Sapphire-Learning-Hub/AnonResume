CREATE TABLE "ai_resume_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"run_kind" text DEFAULT 'resume_review' NOT NULL,
	"input" jsonb NOT NULL,
	"context" jsonb NOT NULL,
	"model_name" text NOT NULL,
	"report" jsonb,
	"ignored_issue_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_resume_reviews_kind_check" CHECK ("ai_resume_reviews"."run_kind" = 'resume_review')
);
--> statement-breakpoint
ALTER TABLE "ai_runs" ALTER COLUMN "conversation_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_runs" ALTER COLUMN "assistant_message_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD COLUMN "kind" text DEFAULT 'conversation' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_runs_id_kind_unique" ON "ai_runs" USING btree ("id","kind");--> statement-breakpoint
ALTER TABLE "ai_resume_reviews" ADD CONSTRAINT "ai_resume_reviews_run_fk" FOREIGN KEY ("run_id","run_kind") REFERENCES "ai_runs"("id","kind") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_resume_reviews_run_unique" ON "ai_resume_reviews" USING btree ("run_id");--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_resume_fk" FOREIGN KEY ("user_id","resume_id") REFERENCES "resumes"("user_id","id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_kind_check" CHECK (("ai_runs"."kind" = 'conversation' AND "ai_runs"."conversation_id" IS NOT NULL AND "ai_runs"."assistant_message_id" IS NOT NULL) OR ("ai_runs"."kind" = 'resume_review' AND "ai_runs"."conversation_id" IS NULL AND "ai_runs"."assistant_message_id" IS NULL));
