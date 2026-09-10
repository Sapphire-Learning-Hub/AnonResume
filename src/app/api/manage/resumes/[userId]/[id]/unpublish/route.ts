import { NextResponse } from "next/server";
import { z } from "zod";

import { adminApiErrorResponse, requireAdminApi } from "@/lib/admin/api";
import {
  adminUnpublishResume,
  AdminManagementNotFoundError,
} from "@/lib/admin/management";

const bodySchema = z.object({ reason: z.string().trim().min(1).max(240) });

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ userId: string; id: string }> },
) {
  try {
    const context = await requireAdminApi({ permission: "resumes.unpublish", recentMfa: true });
    const parsed = bodySchema.safeParse(await _request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    const { userId, id } = await params;
    await adminUnpublishResume({
      actorUserId: context.userId,
      userId,
      resumeId: id,
      reason: parsed.data.reason,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const authError = adminApiErrorResponse(error);
    if (authError) return authError;
    if (error instanceof AdminManagementNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
