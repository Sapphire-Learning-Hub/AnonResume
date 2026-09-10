import type { Metadata } from "next";

import {
  AdminAccessShell,
  AdminActivationPanel,
} from "@/components/admin/AdminAccessPanel";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { getRequestLocale } from "@/i18n/server";
import {
  AdminActivationError,
  inspectAdminActivation,
} from "@/lib/admin/activation";

export async function generateMetadata(): Promise<Metadata> {
  const t = createAdminTranslator(await getRequestLocale());
  return { title: t("activation.superAdmin") };
}

export default async function ActivatePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const tokenValue = (await searchParams).token;
  const token = typeof tokenValue === "string" ? tokenValue : "";
  const t = createAdminTranslator(await getRequestLocale());

  let activation: Awaited<ReturnType<typeof inspectAdminActivation>> | null = null;
  try {
    activation = await inspectAdminActivation(token);
  } catch (error) {
    if (!(error instanceof AdminActivationError)) throw error;
  }

  if (activation) {
    return (
      <AdminAccessShell>
        <AdminActivationPanel
          email={activation.email}
          purpose={activation.purpose}
          requiresMfa={activation.requiresMfa}
          token={token}
        />
      </AdminAccessShell>
    );
  }

  return (
    <AdminAccessShell>
      <h1>{t("activation.unavailableTitle")}</h1>
      <p>{t("activation.unavailableDescription")}</p>
    </AdminAccessShell>
  );
}
