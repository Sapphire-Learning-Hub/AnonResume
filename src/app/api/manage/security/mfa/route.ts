import { NextResponse } from "next/server";
import { z } from "zod";

import { adminApiErrorResponse, requireAdminApi } from "@/lib/admin/api";
import { writeAdminAuditEvent } from "@/lib/admin/audit";
import { getOptionalIdentitySession } from "@/lib/auth/session";
import {
  AdminMfaDeviceConflictError,
  AdminMfaDeviceLimitError,
  AdminMfaLockedError,
  AdminMfaVerificationError,
  beginAdminMfaEnrollment,
  listAdminMfaDevices,
  verifyAdminMfaEnrollment,
} from "@/lib/admin/store";

const beginSchema = z.object({ name: z.string().trim().min(1).max(60) });
const confirmSchema = z.object({
  deviceId: z.uuid(),
  code: z.string().regex(/^\d{6}$/),
});

export async function POST(request: Request) {
  try {
    const context = await requireAdminApi({
      recentMfa: true,
      recoveryMfaEnrollment: true,
    });
    const body = await request.json().catch(() => null);
    const confirmation = confirmSchema.safeParse(body);
    if (confirmation.success) {
      const recoveryCodes = await verifyAdminMfaEnrollment({
        userId: context.userId,
        deviceId: confirmation.data.deviceId,
        token: confirmation.data.code,
      });
      const device = (await listAdminMfaDevices(context.userId))
        .find((item) => item.id === confirmation.data.deviceId);
      await writeAdminAuditEvent({
        actorUserId: context.userId,
        action: "mfa.device.add",
        targetType: "mfa_device",
        targetId: confirmation.data.deviceId,
        outcome: "success",
        metadata: {
          changes: [{ field: "verified", before: false, after: true }],
          recoveryCodesRegenerated: recoveryCodes.length > 0,
          targetSnapshot: {
            label: device?.name ?? confirmation.data.deviceId,
          },
          userId: context.userId,
        },
      });
      return NextResponse.json({ recoveryCodes });
    }

    const beginning = beginSchema.safeParse(body);
    if (!beginning.success) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    const identity = await getOptionalIdentitySession();
    if (!identity || identity.user.id !== context.userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      await beginAdminMfaEnrollment({
        userId: context.userId,
        email: identity.user.email,
        name: beginning.data.name,
      }),
    );
  } catch (error) {
    const authError = adminApiErrorResponse(error);
    if (authError) return authError;
    if (error instanceof AdminMfaDeviceLimitError) {
      return NextResponse.json({ error: "device_limit" }, { status: 409 });
    }
    if (error instanceof AdminMfaDeviceConflictError) {
      return NextResponse.json({ error: "device_conflict" }, { status: 409 });
    }
    if (error instanceof AdminMfaLockedError) {
      return NextResponse.json(
        { error: "mfa_locked", lockedUntil: error.lockedUntil.toISOString() },
        { status: 423 },
      );
    }
    if (error instanceof AdminMfaVerificationError) {
      return NextResponse.json({ error: "invalid_code" }, { status: 400 });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
