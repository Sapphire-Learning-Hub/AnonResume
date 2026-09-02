import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthPanel } from "@/components/auth/AuthPanel";
import { isGitHubAuthEnabled } from "@/lib/auth";
import { getOptionalSession } from "@/lib/auth-session";

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
  const session = await getOptionalSession();
  const params = await searchParams;

  if (session) {
    redirect("/app");
  }

  return (
    <main className="auth-page-shell">
      <AuthPanel
        githubEnabled={isGitHubAuthEnabled()}
        verificationError={
          typeof params.error === "string" ? params.error : undefined
        }
      />
    </main>
  );
}
