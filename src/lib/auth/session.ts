import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getAccountLifecycle } from "@/lib/auth/account/repository";
import { getAuth, type AuthInstance } from "@/lib/auth/config";
import {
  isAccountSuspended,
  isManagementOnlyIdentity,
} from "@/lib/admin/store";

export type AppSession = NonNullable<
  Awaited<ReturnType<AuthInstance["api"]["getSession"]>>
>;

export async function getOptionalIdentitySession() {
  await connection();
  const auth = await getAuth();
  return auth.api.getSession({
    headers: await headers(),
  });
}

export async function getOptionalSession() {
  const session = await getOptionalIdentitySession();

  if (
    session &&
    ((await isManagementOnlyIdentity(session.user.id)) ||
      (await isAccountSuspended(session.user.id)) ||
      (await getAccountLifecycle(session.user.id)).status !== "active")
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
  const lifecycle = await getAccountLifecycle(session.user.id);
  if (lifecycle.status === "pending_deletion") {
    redirect("/account-recovery");
  }
  if (lifecycle.status === "deleted") {
    redirect("/sign-in");
  }

  return session;
}
