import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import {
  isAccountSuspended,
  isManagementOnlyIdentity,
} from "@/lib/admin/store";

export type AppSession = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>;

export async function getOptionalIdentitySession() {
  return auth.api.getSession({
    headers: await headers(),
  });
}

export async function getOptionalSession() {
  const session = await getOptionalIdentitySession();

  if (
    session &&
    ((await isManagementOnlyIdentity(session.user.id)) ||
      (await isAccountSuspended(session.user.id)))
  ) {
    return null;
  }

  return session;
}

export async function requireSession() {
  const session = await getOptionalIdentitySession();

  if (!session) {
    redirect("/sign-in");
  }

  if (await isManagementOnlyIdentity(session.user.id)) {
    redirect("/sign-in");
  }
  if (await isAccountSuspended(session.user.id)) {
    redirect("/sign-in?suspended=1");
  }

  return session;
}
