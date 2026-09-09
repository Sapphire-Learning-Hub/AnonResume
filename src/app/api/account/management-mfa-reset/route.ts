import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AdminMfaResetRequestConflictError,
  AdminMfaResetRequestForbiddenError,
  AdminMfaResetRequestNotFoundError,
  cancelAdminMfaResetRequest,
  getAdminMfaResetRequestForUser,
  submitAdminMfaResetRequest,
} from "@/lib/admin-mfa-reset-requests";
import { getOptionalIdentitySession } from "@/lib/auth-session";

const submissionSchema = z.object({
  reason: z.string().trim().min(10).max(1000),
});

const cancellationSchema = z.object({
  requestId: z.uuid(),
});

function requestErrorResponse(error: unknown) {
  if (error instanceof AdminMfaResetRequestForbiddenError) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (error instanceof AdminMfaResetRequestNotFoundError) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (error instanceof AdminMfaResetRequestConflictError) {
    return NextResponse.json({ error: "conflict" }, { status: 409 });
  }
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}

export async function GET() {
  const session = await getOptionalIdentitySession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json({
      request: await getAdminMfaResetRequestForUser(session.user.id),
    });
  } catch (error) {
    return requestErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const session = await getOptionalIdentitySession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = submissionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const created = await submitAdminMfaResetRequest({
      userId: session.user.id,
      reason: parsed.data.reason,
    });
    return NextResponse.json({ request: created }, { status: 201 });
  } catch (error) {
    return requestErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const session = await getOptionalIdentitySession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = cancellationSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    await cancelAdminMfaResetRequest({
      requestId: parsed.data.requestId,
      userId: session.user.id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return requestErrorResponse(error);
  }
}
