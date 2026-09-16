CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title_zh" text NOT NULL,
	"body_zh" text NOT NULL,
	"title_en" text,
	"body_en" text,
	"tone" text DEFAULT 'info' NOT NULL,
	"audience" text DEFAULT 'all' NOT NULL,
	"dismissible" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_by_user_id" text,
	"updated_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcements_tone_check" CHECK ("announcements"."tone" IN ('info', 'warning', 'critical')),
	CONSTRAINT "announcements_audience_check" CHECK ("announcements"."audience" IN ('all', 'authenticated')),
	CONSTRAINT "announcements_status_check" CHECK ("announcements"."status" IN ('draft', 'published', 'withdrawn')),
	CONSTRAINT "announcements_english_copy_check" CHECK (("announcements"."title_en" IS NULL AND "announcements"."body_en" IS NULL) OR ("announcements"."title_en" IS NOT NULL AND "announcements"."body_en" IS NOT NULL))
);
--> statement-breakpoint
UPDATE "admin_roles"
SET "permissions" = "permissions" || '["announcements.read"]'::jsonb
WHERE "system_key" IN ('read_only_auditor', 'support_operator');
--> statement-breakpoint
UPDATE "admin_roles"
SET "permissions" = "permissions" || '["announcements.read", "announcements.manage"]'::jsonb
WHERE "system_key" = 'system_operator';
--> statement-breakpoint
INSERT INTO "announcements" (
	"id",
	"title_zh",
	"body_zh",
	"title_en",
	"body_en",
	"tone",
	"audience",
	"dismissible",
	"status",
	"published_at"
) VALUES (
	'00000000-0000-4000-8000-000000000002',
	'当前版本为尝鲜测试版',
	'当前所有版本均为尝鲜测试版本，尚未完全稳定，仍可能存在较多问题。正式版本预计随 v2 发布，敬请期待。',
	'Current releases are early access',
	'All current releases are early-access builds and are not yet fully stable. You may still encounter significant issues. The first stable release is planned for v2. Stay tuned.',
	'warning',
	'all',
	true,
	'published',
	now()
);
--> statement-breakpoint
CREATE INDEX "announcements_active_idx" ON "announcements" USING btree ("status","tone","published_at" DESC NULLS LAST);
