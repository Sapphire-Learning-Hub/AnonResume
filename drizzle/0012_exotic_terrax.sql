ALTER TABLE "admin_principals" ADD COLUMN "access_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
UPDATE "admin_principals" AS principal
SET "access_version" = assignment."access_version"
FROM "admin_assignments" AS assignment
WHERE assignment."user_id" = principal."user_id";--> statement-breakpoint
ALTER TABLE "admin_assignments" DROP CONSTRAINT "admin_assignments_pkey";--> statement-breakpoint
ALTER TABLE "admin_assignments" DROP COLUMN "access_version";--> statement-breakpoint
ALTER TABLE "admin_assignments" ADD CONSTRAINT "admin_assignments_user_role_pk" PRIMARY KEY("user_id","role_id");
