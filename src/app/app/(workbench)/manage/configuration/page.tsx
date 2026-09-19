import { AdminConfigurationManager } from "@/components/admin/config/AdminConfigurationManager";
import { requireAdminPage } from "@/lib/admin/page";
import { getManagedConfiguration } from "@/lib/config/admin/service";

export default async function ManagementConfigurationPage() {
  const context = await requireAdminPage("configuration.read", {
    allowRecoveryRequired: true,
  });
  const allowed = (permission: typeof context.permissions[number]) =>
    context.kind === "super_admin" || context.permissions.includes(permission);

  return (
    <AdminConfigurationManager
      canEdit={allowed("configuration.edit")}
      canPublish={allowed("configuration.publish")}
      canReadHistory={allowed("configuration.history")}
      canRollback={allowed("configuration.rollback")}
      initialState={await getManagedConfiguration()}
    />
  );
}
