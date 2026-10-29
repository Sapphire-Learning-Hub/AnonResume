CREATE TABLE "job_application_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"application_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"from_stage" text,
	"to_stage" text,
	"body" text DEFAULT '' NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_events_kind_check" CHECK ("job_application_events"."kind" IN ('created','stage_changed','updated','synced','archived','unarchived','followup')),
	CONSTRAINT "job_events_version_check" CHECK ("job_application_events"."version">0)
);
--> statement-breakpoint
CREATE TABLE "job_applications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"opportunity_id" uuid,
	"snapshot" jsonb NOT NULL,
	"resume_id" text,
	"stage" text DEFAULT 'pending' NOT NULL,
	"channel" text DEFAULT '' NOT NULL,
	"applied_at" timestamp with time zone,
	"notes" text DEFAULT '' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_applications_stage_check" CHECK ("job_applications"."stage" IN ('pending','applied','communicating','interviewing','offered','rejected','withdrawn')),
	CONSTRAINT "job_applications_date_check" CHECK (("job_applications"."stage" = 'pending' AND "job_applications"."applied_at" IS NULL) OR ("job_applications"."stage" = 'withdrawn') OR ("job_applications"."stage" IN ('applied','communicating','interviewing','offered','rejected') AND "job_applications"."applied_at" IS NOT NULL)),
	CONSTRAINT "job_applications_version_check" CHECK ("job_applications"."version">0)
);
--> statement-breakpoint
CREATE TABLE "job_opportunities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"description_hash" text NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_opportunities_version_check" CHECK ("job_opportunities"."version">0),
	CONSTRAINT "job_opportunities_title_check" CHECK (char_length("job_opportunities"."title") BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE TABLE "job_review_links" (
	"user_id" text NOT NULL,
	"review_id" uuid PRIMARY KEY NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"application_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_search_operations" (
	"user_id" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"request_hash" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_search_operations_user_id_operation_id_pk" PRIMARY KEY("user_id","operation_id")
);
--> statement-breakpoint
ALTER TABLE "job_application_events" ADD CONSTRAINT "job_application_events_application_id_job_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "job_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_opportunity_id_job_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "job_opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_review_links" ADD CONSTRAINT "job_review_links_review_id_ai_resume_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "ai_resume_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_review_links" ADD CONSTRAINT "job_review_links_opportunity_id_job_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "job_opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_review_links" ADD CONSTRAINT "job_review_links_application_id_job_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "job_applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_events_application_recent_idx" ON "job_application_events" USING btree ("user_id","application_id","occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "job_applications_owner_stage_idx" ON "job_applications" USING btree ("user_id","archived","stage","activity_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "job_applications_opportunity_idx" ON "job_applications" USING btree ("user_id","opportunity_id");--> statement-breakpoint
CREATE INDEX "job_opportunities_owner_recent_idx" ON "job_opportunities" USING btree ("user_id","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "job_opportunities_description_idx" ON "job_opportunities" USING btree ("user_id","description_hash");--> statement-breakpoint
CREATE INDEX "job_review_links_owner_job_idx" ON "job_review_links" USING btree ("user_id","opportunity_id","created_at" DESC NULLS LAST);