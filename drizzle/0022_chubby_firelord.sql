CREATE TABLE "ai_model_rate_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"input_point_rate" bigint NOT NULL,
	"cached_input_point_rate" bigint NOT NULL,
	"output_point_rate" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_model_rate_versions_values_check" CHECK ("ai_model_rate_versions"."version" > 0 AND "ai_model_rate_versions"."input_point_rate" >= 0 AND "ai_model_rate_versions"."cached_input_point_rate" >= 0 AND "ai_model_rate_versions"."output_point_rate" >= 0)
);
--> statement-breakpoint
ALTER TABLE "ai_model_rate_versions" ADD CONSTRAINT "ai_model_rate_versions_model_fk" FOREIGN KEY ("model_id") REFERENCES "ai_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_model_rate_versions_model_version_unique" ON "ai_model_rate_versions" USING btree ("model_id","version");--> statement-breakpoint
CREATE INDEX "ai_model_rate_versions_model_idx" ON "ai_model_rate_versions" USING btree ("model_id");--> statement-breakpoint
INSERT INTO "ai_model_rate_versions" (
	"model_id",
	"version",
	"input_point_rate",
	"cached_input_point_rate",
	"output_point_rate",
	"created_at"
)
SELECT
	"id",
	"rate_card_version",
	"input_point_rate",
	"cached_input_point_rate",
	"output_point_rate",
	"updated_at"
FROM "ai_models";
