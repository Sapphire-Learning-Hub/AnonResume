import { AdminPage } from "@/components/admin/AdminPage";
import { DiagnosticsManager } from "@/components/admin/diagnostics/DiagnosticsManager";
import { requireAdminPage } from "@/lib/admin/page";
import { getRequestLocale } from "@/i18n/server";
import { createDiagnosticTranslator } from "@/i18n/diagnostics-messages";

export default async function ManagementDiagnosticsPage() {
  await requireAdminPage("diagnostics.read");
  const locale = await getRequestLocale();
  return <AdminPage title={createDiagnosticTranslator(locale)("title")}><DiagnosticsManager locale={locale} /></AdminPage>;
}
