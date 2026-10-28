CREATE TABLE "resume_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"state" text NOT NULL,
	"location" text NOT NULL,
	"bytes" bigint NOT NULL,
	"width" integer DEFAULT 0 NOT NULL,
	"height" integer DEFAULT 0 NOT NULL,
	"digest" text,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resume_assets_state_check" CHECK ("resume_assets"."state" IN ('uploading','ready','deleting')),
	CONSTRAINT "resume_assets_bytes_check" CHECK ("resume_assets"."bytes" >= 0)
);
--> statement-breakpoint
CREATE INDEX "resume_assets_owner_recent_idx" ON "resume_assets" USING btree ("user_id","created_at" DESC NULLS LAST);