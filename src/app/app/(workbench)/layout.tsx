import type { PropsWithChildren } from "react";
import { connection } from "next/server";

import { AppShell } from "@/components/dashboard/AppShell";
import { getRequestLocale } from "@/i18n/server";
import { getVisibleAnnouncements } from "@/lib/announcements/management";
import { requireAppShellContext } from "@/lib/auth/app-shell-context";

export default async function WorkbenchLayout({
  children,
}: PropsWithChildren) {
  await connection();
  const context = await requireAppShellContext();
  const locale = await getRequestLocale();
  const announcements = await getVisibleAnnouncements({
    authenticated: true,
    locale,
  });

  return (
    <AppShell
      access={context.access}
      announcements={announcements}
      user={context.user}
    >
      {children}
    </AppShell>
  );
}
