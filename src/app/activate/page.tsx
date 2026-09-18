import type { Metadata } from "next";
import { cache } from "react";

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

interface ActivationPageProps {
  searchParams: Promise<{ token?: string | string[] }>;
}

function resolveActivationToken(tokenValue?: string | string[]) {
  return typeof tokenValue === "string" ? tokenValue : "";
}

const loadActivation = cache(async (token: string) => {
  try {
    return await inspectAdminActivation(token);
  } catch (error) {
    if (error instanceof AdminActivationError) return null;
    throw error;
  }
});

export async function generateMetadata({
  searchParams,
}: ActivationPageProps): Promise<Metadata> {
  const token = resolveActivationToken((await searchParams).token);
  const activation = await loadActivation(token);
  const t = createAdminTranslator(await getRequestLocale());
  if (!activation) return { title: t("activation.unavailableTitle") };
  return {
    title: activation.purpose === "super_admin"
      ? t("activation.superAdmin")
      : t("activation.invited"),
  };
}

export default async function ActivatePage({
  searchParams,
}: ActivationPageProps) {
  const token = resolveActivationToken((await searchParams).token);
  const t = createAdminTranslator(await getRequestLocale());
  const activation = await loadActivation(token);

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
