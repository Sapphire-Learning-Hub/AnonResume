import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminSetupWizard } from "@/components/admin/setup/AdminSetupWizard";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { getRequestLocale } from "@/i18n/server";
import { inspectPublicSetupStatus } from "@/lib/admin/setup/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = createAdminTranslator(await getRequestLocale());
  return {
    title: t("setup.documentTitle"),
    robots: { index: false, follow: false },
  };
}

export default async function SetupPage() {
  const status = await inspectPublicSetupStatus();
  if (!status.required) redirect("/sign-in");

  return <AdminSetupWizard initialMode={status.mode} />;
}
