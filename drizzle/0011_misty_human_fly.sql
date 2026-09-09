DROP INDEX "admin_roles_name_unique";--> statement-breakpoint
ALTER TABLE "admin_roles" ALTER COLUMN "created_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_roles" ADD COLUMN "system_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_roles_system_key_unique" ON "admin_roles" USING btree ("system_key");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_roles_name_unique" ON "admin_roles" USING btree (lower("name")) WHERE "admin_roles"."system_key" IS NULL;--> statement-breakpoint
ALTER TABLE "admin_roles" ADD CONSTRAINT "admin_roles_system_key_check" CHECK ("admin_roles"."system_key" IS NULL OR "admin_roles"."system_key" IN ('read_only_auditor', 'support_operator', 'content_reviewer', 'system_operator'));--> statement-breakpoint
ALTER TABLE "admin_roles" ADD CONSTRAINT "admin_roles_origin_check" CHECK (("admin_roles"."system_key" IS NULL AND "admin_roles"."created_by_user_id" IS NOT NULL) OR ("admin_roles"."system_key" IS NOT NULL AND "admin_roles"."created_by_user_id" IS NULL));--> statement-breakpoint
INSERT INTO "admin_roles" ("name", "description", "permissions", "system_key", "created_by_user_id") VALUES
  ('只读审计员', '查看系统概览、用户与审计记录，不读取简历正文。', '["overview.read","users.read","resumes.metadata.read","exports.read","audit.read","system.read"]'::jsonb, 'read_only_auditor', NULL),
  ('支持专员', '处理用户状态、会话与导出队列，不读取简历正文。', '["overview.read","users.read","users.suspend","users.sessions.revoke","resumes.metadata.read","exports.read","exports.cancel","exports.retry"]'::jsonb, 'support_operator', NULL),
  ('内容审核员', '查看简历元数据和正文，并可撤回已公开简历。', '["overview.read","users.read","resumes.metadata.read","resumes.content.read","resumes.unpublish","audit.read"]'::jsonb, 'content_reviewer', NULL),
  ('系统运维员', '查看系统与导出队列状态，并处理失败或积压任务。', '["overview.read","exports.read","exports.cancel","exports.retry","audit.read","system.read"]'::jsonb, 'system_operator', NULL)
ON CONFLICT ("system_key") DO NOTHING;
