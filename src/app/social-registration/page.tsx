import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SocialRegistrationPanel } from "@/components/auth/SocialRegistrationPanel";
import { getRequestLocale } from "@/i18n/server";
import { getVisibleAnnouncements } from "@/lib/announcements/management";
import { getOptionalIdentitySession } from "@/lib/auth/session";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function SocialRegistrationPage() {
  const session = await getOptionalIdentitySession();
  if (session) redirect("/app");

  const locale = await getRequestLocale();
  const announcements = await getVisibleAnnouncements({
    authenticated: false,
    locale,
  });

  return (
    <main className="auth-page-shell">
      <SocialRegistrationPanel announcements={announcements} />
    </main>
  );
}
