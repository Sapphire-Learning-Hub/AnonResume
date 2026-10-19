CREATE TABLE "diagnostic_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"diagnostic_id" uuid NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"fault" boolean NOT NULL,
	"fingerprint" text,
	"source" text NOT NULL,
	"request_id" uuid,
	"task_id" uuid,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diagnostic_operations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"faulted" boolean DEFAULT false NOT NULL,
	"truncated" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diagnostic_tasks" (
	"diagnostic_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"state" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "diagnostic_tasks_diagnostic_id_task_id_pk" PRIMARY KEY("diagnostic_id","task_id")
);
--> statement-breakpoint
ALTER TABLE "diagnostic_events" ADD CONSTRAINT "diagnostic_events_diagnostic_id_diagnostic_operations_id_fk" FOREIGN KEY ("diagnostic_id") REFERENCES "diagnostic_operations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostic_tasks" ADD CONSTRAINT "diagnostic_tasks_diagnostic_id_diagnostic_operations_id_fk" FOREIGN KEY ("diagnostic_id") REFERENCES "diagnostic_operations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "diagnostic_events_operation_idx" ON "diagnostic_events" USING btree ("diagnostic_id","at");--> statement-breakpoint
CREATE INDEX "diagnostic_events_recent_idx" ON "diagnostic_events" USING btree ("fault","at","id");--> statement-breakpoint
CREATE INDEX "diagnostic_events_request_idx" ON "diagnostic_events" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "diagnostic_events_task_idx" ON "diagnostic_events" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "diagnostic_events_group_idx" ON "diagnostic_events" USING btree ("fingerprint","source","at");--> statement-breakpoint
CREATE INDEX "diagnostic_operations_expiry_idx" ON "diagnostic_operations" USING btree ("expires_at");
--> statement-breakpoint
UPDATE "admin_roles" SET "permissions"="permissions" || '["diagnostics.read"]'::jsonb,"updated_at"=now()
WHERE "system_key" IN ('system_operator','platform_configuration_manager') AND NOT ("permissions" ? 'diagnostics.read');
--> statement-breakpoint
UPDATE "admin_principals" SET "access_version"="access_version"+1,"updated_at"=now()
WHERE "user_id" IN (SELECT a."user_id" FROM "admin_assignments" a JOIN "admin_roles" r ON r."id"=a."role_id" WHERE r."system_key" IN ('system_operator','platform_configuration_manager'));
--> statement-breakpoint
UPDATE "admin_sessions" SET "revoked_at"=now() WHERE "revoked_at" IS NULL
AND "user_id" IN (SELECT a."user_id" FROM "admin_assignments" a JOIN "admin_roles" r ON r."id"=a."role_id" WHERE r."system_key" IN ('system_operator','platform_configuration_manager'));
