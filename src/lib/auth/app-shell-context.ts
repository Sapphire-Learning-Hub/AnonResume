import { redirect } from "next/navigation";

import { resolveAppShellAccess } from "@/lib/auth/app-shell-access";
import {
  AdminAuthenticationError,
  type AdminAuthorizationContext,
} from "@/lib/admin/authorization";
import { getAdminRequestContext } from "@/lib/admin/request";
import {
  getAdminAccessForUser,
  hasVerifiedAdminMfaDevice,
  isAccountSuspended,
} from "@/lib/admin/store";
import { getOptionalIdentitySession } from "@/lib/auth/session";

export async function requireAppShellContext() {
  const identity = await getOptionalIdentitySession();
  if (!identity) redirect("/sign-in");

  const [assignedManagement, suspended] = await Promise.all([
    getAdminAccessForUser(identity.user.id),
    isAccountSuspended(identity.user.id),
  ]);
  if (suspended) redirect("/sign-in?suspended=1");

  const mfaConfigured = assignedManagement
    ? await hasVerifiedAdminMfaDevice(identity.user.id)
    : false;

  let activeManagement: AdminAuthorizationContext | null = null;
  try {
    activeManagement = await getAdminRequestContext();
  } catch (error) {
    if (!(error instanceof AdminAuthenticationError)) throw error;
  }

  const productAccess = assignedManagement?.kind !== "super_admin";
  if (!productAccess && !activeManagement) redirect("/sign-in");

  return {
    access: resolveAppShellAccess({
      activeManagement: activeManagement
        ? {
            kind: activeManagement.kind,
            permissions: activeManagement.permissions,
            recoveryRequired: activeManagement.recoveryRequired,
          }
        : null,
      assignedManagement: assignedManagement
        ? { kind: assignedManagement.kind, mfaConfigured }
        : null,
      productAccess,
    }),
    user: identity.user,
  };
}
