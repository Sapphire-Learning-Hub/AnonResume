import type { Metadata } from "next";

import { AccountCenter } from "@/components/account/AccountCenter";
import { isGitHubAuthEnabled } from "@/lib/auth/config";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Account | AnonResume",
  robots: { index: false, follow: false },
};

type AccountPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AccountPage({ searchParams }: AccountPageProps) {
  await requireSession();
  const [githubEnabled, params] = await Promise.all([
    isGitHubAuthEnabled(),
    searchParams,
  ]);
  const section = firstSearchParam(params.section);
  const linked = firstSearchParam(params.linked);
  const linkError = firstSearchParam(params.linkError);

  return (
    <AccountCenter
      connectionNotice={linked === "github"
        ? "linked"
        : linkError === "github"
          ? "error"
          : undefined}
      githubEnabled={githubEnabled}
      initialSection={githubEnabled && section === "connections"
        ? "connections"
        : "profile"}
    />
  );
}
