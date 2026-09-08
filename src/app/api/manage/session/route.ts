import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getOptionalIdentitySession } from "@/lib/auth-session";
import {
  AdminMfaDeviceConflictError,
  createAdminSession,
  consumeAdminRecoveryCode,
  beginAdminMfaEnrollment,
  getAdminAccessForUser,
  hasVerifiedAdminMfaDevice,
  revokeAdminSessionByToken,
  verifyAdminMfaEnrollment,
  verifyAdminMfaCode,
  AdminMfaLockedError,
  AdminMfaVerificationError,
} from "@/lib/admin-store";
import {
  ADMIN_SESSION_COOKIE,
  getAdminSessionClearCookieOptions,
  getAdminSessionCookieOptions,
} from "@/lib/admin-request";
import { resolveAdminSecurityConfiguration } from "@/lib/admin-configuration";

const verificationSchema = z.object({
  code: z.string().trim().regex(/^(?:\d{6}|[A-Fa-f0-9]{4}(?:-[A-Fa-f0-9]{4}){4})$/),
});
const beginEnrollmentSchema = z.object({
  action: z.literal("begin_enrollment"),
  deviceName: z.string().trim().min(1).max(60),
});
const completeEnrollmentSchema = z.object({
  action: z.literal("complete_enrollment"),
  code: z.string().regex(/^\d{6}$/),
  deviceId: z.uuid(),
});
const bodySchema = z.union([
  beginEnrollmentSchema,
  completeEnrollmentSchema,
  verificationSchema,
]);

async function setManagementSessionCookie(rawToken: string) {
  const config = resolveAdminSecurityConfiguration(process.env);
  const cookieStore = await cookies();
  cookieStore.set(
    ADMIN_SESSION_COOKIE,
    rawToken,
    getAdminSessionCookieOptions(config.maxSeconds),
  );
}

export async function POST(request: Request) {
  const session = await getOptionalIdentitySession();
  if (!session || !(await getAdminAccessForUser(session.user.id))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    if ("action" in parsed.data) {
      if (await hasVerifiedAdminMfaDevice(session.user.id)) {
        return NextResponse.json(
          { error: "mfa_already_configured" },
          { status: 409 },
        );
      }

      if (parsed.data.action === "begin_enrollment") {
        return NextResponse.json(
          await beginAdminMfaEnrollment({
            userId: session.user.id,
            email: session.user.email,
            name: parsed.data.deviceName,
            requireNoVerifiedDevices: true,
          }),
        );
      }

      const recoveryCodes = await verifyAdminMfaEnrollment({
        userId: session.user.id,
        deviceId: parsed.data.deviceId,
        token: parsed.data.code,
        requireNoVerifiedDevices: true,
      });
      const created = await createAdminSession({
        userId: session.user.id,
        baseSessionId: session.session.id,
        mfaDeviceId: parsed.data.deviceId,
      });
      await setManagementSessionCookie(created.rawToken);
      return NextResponse.json({ ok: true, recoveryCodes });
    }

    const isRecoveryCode = parsed.data.code.includes("-");
    const mfaDeviceId = isRecoveryCode
      ? null
      : await verifyAdminMfaCode({
          userId: session.user.id,
          token: parsed.data.code,
        });
    if (
      isRecoveryCode &&
      !(await consumeAdminRecoveryCode(session.user.id, parsed.data.code))
    ) {
      throw new AdminMfaVerificationError();
    }
    const created = await createAdminSession({
      userId: session.user.id,
      baseSessionId: session.session.id,
      mfaDeviceId,
    });
    await setManagementSessionCookie(created.rawToken);
    const currentAccess = await getAdminAccessForUser(session.user.id);
    return NextResponse.json({
      ok: true,
      recoveryRequired: currentAccess?.recoveryRequired === true,
    });
  } catch (error) {
    if (error instanceof AdminMfaLockedError) {
      return NextResponse.json(
        { error: "mfa_locked", lockedUntil: error.lockedUntil.toISOString() },
        { status: 423 },
      );
    }
    if (error instanceof AdminMfaVerificationError) {
      return NextResponse.json({ error: "invalid_code" }, { status: 401 });
    }
    if (error instanceof AdminMfaDeviceConflictError) {
      return NextResponse.json(
        { error: "mfa_already_configured" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (rawToken) await revokeAdminSessionByToken(rawToken);
  cookieStore.set(
    ADMIN_SESSION_COOKIE,
    "",
    getAdminSessionClearCookieOptions(),
  );
  return NextResponse.json({ ok: true });
}
