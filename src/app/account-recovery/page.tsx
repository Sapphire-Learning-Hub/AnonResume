import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AccountRecoveryPage } from "@/components/account/AccountRecoveryPage";
import { getVisibleAnnouncements } from "@/lib/announcements/management";
import { isManagementOnlyIdentity } from "@/lib/admin/store";
import { getAccountLifecycle } from "@/lib/auth/account/repository";
import { getOptionalIdentitySession } from "@/lib/auth/session";
import { getRequestLocale } from "@/i18n/server";

export const metadata: Metadata = {
  title: "Account recovery | AnonResume",
  robots: { index: false, follow: false },
};

export default async function AccountRecoveryRoute() {
  const identity = await getOptionalIdentitySession();
  if (!identity || await isManagementOnlyIdentity(identity.user.id)) {
    redirect("/sign-in");
  }
  const lifecycle = await getAccountLifecycle(identity.user.id);
  if (lifecycle.status === "active") redirect("/app");
  if (lifecycle.status === "deleted" || !lifecycle.deletionDueAt) {
    redirect("/sign-in");
  }
  const locale = await getRequestLocale();
  const announcements = await getVisibleAnnouncements({
    authenticated: true,
    locale,
  });

  return (
    <main className="auth-page-shell">
      <AccountRecoveryPage
        announcements={announcements}
        deletionDueAt={lifecycle.deletionDueAt.toISOString()}
        email={identity.user.email}
      />
    </main>
  );
}
