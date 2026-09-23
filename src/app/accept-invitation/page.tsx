import type { Metadata } from "next";

import { AuthExperienceShell } from "@/components/auth/AuthExperienceShell";
import { AcceptInvitationPanel } from "@/components/invitations/AcceptInvitationPanel";
import { inspectUserInvitation } from "@/lib/invitations/acceptance";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const invitation = await inspectUserInvitation(token).catch(() => null);

  return (
    <main className="auth-page-shell">
      <AuthExperienceShell>
        <AcceptInvitationPanel email={invitation?.email ?? null} token={token} />
      </AuthExperienceShell>
    </main>
  );
}
