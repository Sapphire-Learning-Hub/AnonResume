CREATE TABLE "resume_template_operations" (
	"user_id" text NOT NULL,
	"operation_id" text NOT NULL,
	"kind" text NOT NULL,
	"request_hash" text NOT NULL,
	"result_id" text NOT NULL,
	"result_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resume_template_operations_user_id_operation_id_pk" PRIMARY KEY("user_id","operation_id"),
	CONSTRAINT "resume_template_operations_kind_check" CHECK ("resume_template_operations"."kind" IN ('save', 'replace', 'instantiate'))
);
--> statement-breakpoint
CREATE TABLE "resume_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"document" jsonb NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resume_templates_version_check" CHECK ("resume_templates"."version" > 0),
	CONSTRAINT "resume_templates_name_check" CHECK (char_length("resume_templates"."name") BETWEEN 1 AND 100 AND "resume_templates"."name" = btrim("resume_templates"."name"))
);
--> statement-breakpoint
CREATE INDEX "resume_templates_owner_recent_idx" ON "resume_templates" USING btree ("user_id","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);