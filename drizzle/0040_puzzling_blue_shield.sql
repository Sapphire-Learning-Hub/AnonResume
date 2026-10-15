CREATE TABLE "user_font_preferences" (
	"user_id" text NOT NULL,
	"font_preset_id" text NOT NULL,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"last_applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_font_preferences_user_id_font_preset_id_pk" PRIMARY KEY("user_id","font_preset_id")
);
--> statement-breakpoint
CREATE INDEX "user_font_preferences_recent_idx" ON "user_font_preferences" USING btree ("user_id","last_applied_at" DESC NULLS LAST);