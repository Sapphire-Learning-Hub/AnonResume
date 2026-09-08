import { NextResponse } from "next/server";

import { adminApiErrorResponse, requireAdminApi } from "@/lib/admin-api";
import { writeAdminAuditEvent } from "@/lib/admin-audit";
import {
  AdminMfaDeviceConflictError,
  removeAdminMfaDevice,
} from "@/lib/admin-store";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireAdminApi({
      recentMfa: true,
      allowRecoveryRequired: true,
    });
    const deviceId = (await params).id;
    await removeAdminMfaDevice(context.userId, deviceId);
    await writeAdminAuditEvent({
      actorUserId: context.userId,
      action: "mfa.device.remove",
      targetType: "mfa_device",
      targetId: deviceId,
      outcome: "success",
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const authError = adminApiErrorResponse(error);
    if (authError) return authError;
    if (error instanceof AdminMfaDeviceConflictError) {
      return NextResponse.json({ error: "device_conflict" }, { status: 409 });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
