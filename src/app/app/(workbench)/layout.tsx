import type { PropsWithChildren } from "react";
import { connection } from "next/server";

import { AppShell } from "@/components/dashboard/AppShell";
import { getRequestLocale } from "@/i18n/server";
import { getVisibleAnnouncements } from "@/lib/announcements/management";
import { requireAppShellContext } from "@/lib/auth/app-shell-context";
import { getRuntimeConfig } from "@/lib/config/runtime";

export default async function WorkbenchLayout({
  children,
}: PropsWithChildren) {
  await connection();
  const context = await requireAppShellContext();
  const [locale, runtime] = await Promise.all([
    getRequestLocale(),
    getRuntimeConfig("web").catch(() => null),
  ]);
  const announcements = await getVisibleAnnouncements({
    authenticated: true,
    locale,
  });
  const runtimeHealth = runtime?.health ?? "recovery_required";
  const configurationHealth =
    runtimeHealth === "restart_required" && context.access.mode !== "management"
      ? "healthy"
      : runtimeHealth;

  return (
    <AppShell
      access={context.access}
      announcements={announcements}
      configurationHealth={configurationHealth}
      user={{
        email: context.user.email,
        name: context.user.name,
      }}
    >
      {children}
    </AppShell>
  );
}
