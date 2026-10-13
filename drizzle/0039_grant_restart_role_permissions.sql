UPDATE "admin_roles"
   SET "permissions" = CASE "system_key"
         WHEN 'system_operator' THEN '["overview.read","exports.read","exports.cancel","exports.retry","announcements.read","announcements.manage","ai.providers.manage","ai.usage.read","audit.read","system.read","system.restart","configuration.read","configuration.history"]'::jsonb
         WHEN 'platform_configuration_manager' THEN '["overview.read","audit.read","system.read","system.restart","configuration.read","configuration.edit","configuration.publish","configuration.history","configuration.rollback"]'::jsonb
       END,
       "updated_at" = now()
 WHERE "system_key" IN ('system_operator', 'platform_configuration_manager')
   AND NOT ("permissions" ? 'system.restart');
--> statement-breakpoint
UPDATE "admin_principals"
   SET "access_version" = "access_version" + 1,
       "updated_at" = now()
 WHERE "user_id" IN (
   SELECT assignment."user_id"
     FROM "admin_assignments" AS assignment
     JOIN "admin_roles" AS role ON role."id" = assignment."role_id"
    WHERE role."system_key" IN ('system_operator', 'platform_configuration_manager')
 );
--> statement-breakpoint
UPDATE "admin_sessions"
   SET "revoked_at" = now()
 WHERE "revoked_at" IS NULL
   AND "user_id" IN (
     SELECT assignment."user_id"
       FROM "admin_assignments" AS assignment
       JOIN "admin_roles" AS role ON role."id" = assignment."role_id"
      WHERE role."system_key" IN ('system_operator', 'platform_configuration_manager')
   );
