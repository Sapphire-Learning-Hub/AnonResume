import { cookies } from "next/headers";

import {
  AdminAuthenticationError,
  authorizeAdminRequest,
} from "@/lib/admin/authorization";
import { resolveAdminSecurityConfiguration } from "@/lib/admin/configuration";
import { getOptionalIdentitySession } from "@/lib/auth/session";
import { PostgresAdminAuthorizationStore } from "@/lib/admin/store";
import { getRuntimeConfig } from "@/lib/config/runtime";

export const ADMIN_SESSION_COOKIE = "anonresume.admin_session";

export async function getAdminRequestContext() {
  const baseSession = await getOptionalIdentitySession();
  if (!baseSession) throw new AdminAuthenticationError();

  const [cookieStore, runtime] = await Promise.all([
    cookies(),
    getRuntimeConfig("web"),
  ]);

  const context = await authorizeAdminRequest({
    store: new PostgresAdminAuthorizationStore(),
    baseSession: {
      userId: baseSession.user.id,
      sessionId: baseSession.session.id,
    },
    rawAdminToken: cookieStore.get(ADMIN_SESSION_COOKIE)?.value,
    idleSeconds: resolveAdminSecurityConfiguration(runtime.values).idleSeconds,
  });

  return {
    ...context,
    userEmail: baseSession.user.email,
  };
}

export function getAdminSessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export function getAdminSessionClearCookieOptions() {
  return {
    ...getAdminSessionCookieOptions(0),
    expires: new Date(0),
  };
}
