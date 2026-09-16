import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthPanel } from "@/components/auth/AuthPanel";
import {
  AdminAccessShell,
  AdminMfaPanel,
} from "@/components/admin/AdminAccessPanel";
import { isGitHubAuthEnabled } from "@/lib/auth/config";
import {
  AdminAuthenticationError,
  type AdminAuthorizationContext,
} from "@/lib/admin/authorization";
import { getAdminRequestContext } from "@/lib/admin/request";
import { resolveAuthenticatedEntry } from "@/lib/admin/sign-in-flow";
import { getAdminAccessForUser, isAccountSuspended } from "@/lib/admin/store";
import { getOptionalIdentitySession } from "@/lib/auth/session";
import { getVisibleAnnouncements } from "@/lib/announcements/management";
import { getRequestLocale } from "@/i18n/server";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const session = await getOptionalIdentitySession();
  const params = await searchParams;
  const locale = await getRequestLocale();
  const announcements = await getVisibleAnnouncements({
    authenticated: Boolean(session),
    locale,
  });

  if (session) {
    if (await isAccountSuspended(session.user.id)) {
      return (
        <main className="auth-page-shell">
          <AuthPanel
            announcements={announcements}
            githubEnabled={isGitHubAuthEnabled()}
            verificationError="ACCOUNT_SUSPENDED"
          />
        </main>
      );
    }

    const assignedManagement = await getAdminAccessForUser(session.user.id);
    let activeManagement: AdminAuthorizationContext | null = null;
    try {
      activeManagement = await getAdminRequestContext();
    } catch (error) {
      if (!(error instanceof AdminAuthenticationError)) throw error;
    }

    const destination = resolveAuthenticatedEntry({
      activeManagement,
      assignedManagement,
      productAccess: assignedManagement?.kind !== "super_admin",
    });
    if (destination !== "management_mfa") redirect(destination);

    return (
      <AdminAccessShell>
        <AdminMfaPanel />
      </AdminAccessShell>
    );
  }

  return (
    <main className="auth-page-shell">
      <AuthPanel
        announcements={announcements}
        githubEnabled={isGitHubAuthEnabled()}
        verificationError={
          typeof params.error === "string" ? params.error : undefined
        }
      />
    </main>
  );
}
