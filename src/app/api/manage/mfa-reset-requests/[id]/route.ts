import { NextResponse } from "next/server";
import { z } from "zod";

import { adminApiErrorResponse, requireAdminApi } from "@/lib/admin-api";
import {
  AdminMfaResetRequestConflictError,
  AdminMfaResetRequestForbiddenError,
  AdminMfaResetRequestNotFoundError,
  reviewAdminMfaResetRequest,
} from "@/lib/admin-mfa-reset-requests";

const reviewSchema = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("approved"),
    reason: z.string().trim().max(1000).optional(),
  }),
  z.object({
    decision: z.literal("rejected"),
    reason: z.string().trim().min(1).max(1000),
  }),
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireAdminApi({
      superAdminOnly: true,
      recentMfa: true,
    });
    const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    const reviewed = await reviewAdminMfaResetRequest({
      actorUserId: context.userId,
      requestId: (await params).id,
      decision: parsed.data.decision,
      reason: parsed.data.reason,
    });
    return NextResponse.json({ request: reviewed });
  } catch (error) {
    const authError = adminApiErrorResponse(error);
    if (authError) return authError;
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
}
