import type { PropsWithChildren } from "react";

import { AppShell } from "@/components/dashboard/AppShell";
import { requireAppShellContext } from "@/lib/auth/app-shell-context";

export default async function WorkbenchLayout({
  children,
}: PropsWithChildren) {
  const context = await requireAppShellContext();

  return (
    <AppShell access={context.access} user={context.user}>
      {children}
    </AppShell>
  );
}
