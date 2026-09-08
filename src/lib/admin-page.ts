import { redirect } from "next/navigation";

import type { AdminPermission } from "./admin-permissions";
import {
  AdminAuthenticationError,
  AdminMfaRecoveryRequiredError,
  AdminPermissionError,
  requireAdminPermission,
} from "./admin-authorization";
import { getAdminRequestContext } from "./admin-request";
import { getAdminAccessForUser } from "./admin-store";
import { getOptionalIdentitySession } from "./auth-session";

export function resolveAdminPageFailureDestination(
  reason: "forbidden" | "recovery" | "unauthenticated",
  productAccess: boolean,
) {
  if (reason === "recovery") return "/app/manage/security";
  if (reason === "forbidden") return "/app/manage/forbidden";
  return productAccess ? "/app" : "/sign-in";
}

async function currentIdentityHasProductAccess() {
  const identity = await getOptionalIdentitySession();
  if (!identity) return false;
  const access = await getAdminAccessForUser(identity.user.id);
  return access?.kind !== "super_admin";
}

export async function requireAdminPage(
  permission?: AdminPermission,
  options: { allowRecoveryRequired?: boolean } = {},
) {
  try {
    const context = await getAdminRequestContext();
    if (context.recoveryRequired && !options.allowRecoveryRequired) {
      throw new AdminMfaRecoveryRequiredError();
    }
    if (permission) requireAdminPermission(context, permission);
    return context;
  } catch (error) {
    if (error instanceof AdminAuthenticationError) {
      redirect(
        resolveAdminPageFailureDestination(
          "unauthenticated",
          await currentIdentityHasProductAccess(),
        ),
      );
    }
    if (error instanceof AdminMfaRecoveryRequiredError) {
      redirect(resolveAdminPageFailureDestination("recovery", false));
    }
    if (error instanceof AdminPermissionError) {
      redirect(resolveAdminPageFailureDestination("forbidden", true));
    }
    throw error;
  }
}
