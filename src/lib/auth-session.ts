import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "./auth";

export type AppSession = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>;

export async function getOptionalSession() {
  return auth.api.getSession({
    headers: await headers(),
  });
}

export async function requireSession() {
  const session = await getOptionalSession();

  if (!session) {
    redirect("/sign-in");
  }

  return session;
}
