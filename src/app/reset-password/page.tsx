import type { Metadata } from "next";

import { PasswordResetPanel } from "@/components/auth/PasswordResetPanel";
import { getVisibleAnnouncements } from "@/lib/announcements/management";
import { getRequestLocale } from "@/i18n/server";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const locale = await getRequestLocale();
  const announcements = await getVisibleAnnouncements({
    authenticated: false,
    locale,
  });

  return (
    <main className="auth-page-shell">
      <PasswordResetPanel
        announcements={announcements}
        token={typeof params.token === "string" ? params.token : null}
      />
    </main>
  );
}
