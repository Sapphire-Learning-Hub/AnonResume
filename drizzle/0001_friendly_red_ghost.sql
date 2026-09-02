CREATE TABLE IF NOT EXISTS "resume_versions" (
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"resume_id" text NOT NULL,
	"version" integer NOT NULL,
	"document" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resume_versions_id_pk" PRIMARY KEY("id")
);
