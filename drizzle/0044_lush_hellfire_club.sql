ALTER TABLE "resume_versions" ADD COLUMN "kind" text DEFAULT 'retained' NOT NULL;--> statement-breakpoint
ALTER TABLE "resumes" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "resumes" ADD COLUMN "purge_after" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "resume_versions_autosave_unique" ON "resume_versions" USING btree ("user_id","resume_id") WHERE "resume_versions"."kind" = 'autosave';--> statement-breakpoint
CREATE INDEX "resumes_trash_owner_idx" ON "resumes" USING btree ("user_id","deleted_at" DESC NULLS LAST,"id") WHERE "resumes"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "resumes_trash_due_idx" ON "resumes" USING btree ("purge_after","id") WHERE "resumes"."deleted_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "resume_versions" ADD CONSTRAINT "resume_versions_kind_check" CHECK ("resume_versions"."kind" IN ('retained', 'autosave'));--> statement-breakpoint
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_trash_lifecycle_check" CHECK (("resumes"."deleted_at" IS NULL AND "resumes"."purge_after" IS NULL) OR ("resumes"."deleted_at" IS NOT NULL AND "resumes"."purge_after" IS NOT NULL AND "resumes"."purge_after" > "resumes"."deleted_at" AND "resumes"."published" = false AND "resumes"."kind" = 'standard'));