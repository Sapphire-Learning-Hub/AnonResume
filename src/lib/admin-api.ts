import { NextResponse } from "next/server";

import {
  AdminAuthenticationError,
  AdminMfaRecoveryRequiredError,
  AdminPermissionError,
  AdminReauthenticationRequiredError,
  requireAdminPermission,
  requireRecentAdminReauthentication,
} from "./admin-authorization";
import { writeAdminAuditEvent } from "./admin-audit";
import { resolveAdminSecurityConfiguration } from "./admin-configuration";
import type { AdminPermission } from "./admin-permissions";
import { getAdminRequestContext } from "./admin-request";

export async function requireAdminApi(input: {
  permission?: AdminPermission;
  superAdminOnly?: boolean;
  recentMfa?: boolean;
  allowRecoveryRequired?: boolean;
  recoveryMfaEnrollment?: boolean;
}) {
  const context = await getAdminRequestContext();
  if (
    context.recoveryRequired &&
    !input.allowRecoveryRequired &&
    !input.recoveryMfaEnrollment
  ) {
    throw new AdminMfaRecoveryRequiredError();
  }
  if (input.superAdminOnly && context.kind !== "super_admin") {
    await writeAdminAuditEvent({
      actorUserId: context.userId,
      action: "authorization.denied",
      targetType: "super_admin_capability",
      outcome: "denied",
    });
    throw new AdminPermissionError("system.read");
  }
  if (input.permission) {
    try {
      requireAdminPermission(context, input.permission);
    } catch (error) {
      await writeAdminAuditEvent({
        actorUserId: context.userId,
        action: "authorization.denied",
        targetType: "permission",
        targetId: input.permission,
        outcome: "denied",
      });
      throw error;
    }
  }
  if (input.recentMfa) {
    try {
      requireRecentAdminReauthentication(
        context,
        new Date(),
        resolveAdminSecurityConfiguration(process.env).reauthSeconds,
        { allowRecoveryEnrollment: input.recoveryMfaEnrollment },
      );
    } catch (error) {
      await writeAdminAuditEvent({
        actorUserId: context.userId,
        action: "reauthentication.required",
        targetType: "admin_session",
        targetId: context.adminSessionId,
        outcome: "denied",
      });
      throw error;
    }
  }
  return context;
}

export function adminApiErrorResponse(error: unknown) {
  if (error instanceof AdminAuthenticationError) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (error instanceof AdminPermissionError) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (error instanceof AdminMfaRecoveryRequiredError) {
    return NextResponse.json(
      { error: "mfa_recovery_required" },
      { status: 423 },
    );
  }
  if (error instanceof AdminReauthenticationRequiredError) {
    return NextResponse.json({ error: "mfa_reauthentication_required" }, { status: 428 });
  }
  return null;
}
