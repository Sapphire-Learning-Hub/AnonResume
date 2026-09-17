ALTER TABLE "admin_roles" DROP CONSTRAINT "admin_roles_system_key_check";--> statement-breakpoint
ALTER TABLE "admin_roles" ADD CONSTRAINT "admin_roles_system_key_check" CHECK ("admin_roles"."system_key" IS NULL OR "admin_roles"."system_key" IN ('read_only_auditor', 'support_operator', 'content_reviewer', 'system_operator', 'ai_service_manager'));--> statement-breakpoint
INSERT INTO "admin_roles" ("name", "description", "permissions", "system_key", "created_by_user_id") VALUES
  ('只读审计员', '查看系统概览、用户、公告、AI 用量与审计记录，不读取简历正文。', '["overview.read","users.read","resumes.metadata.read","exports.read","announcements.read","ai.usage.read","audit.read","system.read"]'::jsonb, 'read_only_auditor', NULL),
  ('支持专员', '处理用户状态、会话与导出队列，并查看公告和 AI 用量，不读取简历正文。', '["overview.read","users.read","users.suspend","users.sessions.revoke","resumes.metadata.read","exports.read","exports.cancel","exports.retry","announcements.read","ai.usage.read"]'::jsonb, 'support_operator', NULL),
  ('内容审核员', '查看简历元数据和正文，并可撤回已公开简历。', '["overview.read","users.read","resumes.metadata.read","resumes.content.read","resumes.unpublish","audit.read"]'::jsonb, 'content_reviewer', NULL),
  ('系统运维员', '管理公告与 AI 模型服务，查看系统、AI 用量与导出队列状态。', '["overview.read","exports.read","exports.cancel","exports.retry","announcements.read","announcements.manage","ai.providers.manage","ai.usage.read","audit.read","system.read"]'::jsonb, 'system_operator', NULL),
  ('AI 服务管理员', '管理 AI 模型服务、用户额度与结算，并查看 AI 用量，不读取敏感请求内容。', '["overview.read","ai.providers.manage","ai.quotas.manage","ai.usage.read"]'::jsonb, 'ai_service_manager', NULL)
ON CONFLICT ("system_key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "permissions" = EXCLUDED."permissions",
  "updated_at" = now();
