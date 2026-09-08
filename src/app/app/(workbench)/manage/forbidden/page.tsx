import { createAdminTranslator } from "@/i18n/admin-messages";
import { getRequestLocale } from "@/i18n/server";
import { requireAdminPage } from "@/lib/admin-page";

export default async function ManagementForbiddenPage() {
  await requireAdminPage();
  const t = createAdminTranslator(await getRequestLocale());
  return <p>{t("forbidden")}</p>;
}
