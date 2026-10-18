import { withRequestLogging } from "@/lib/observability/http";

import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/admin/api";
import { announcementApiErrorResponse } from "@/lib/announcements/api";
import {
  deleteAnnouncementDraft,
  updateAnnouncement,
} from "@/lib/announcements/management";
import { parseAnnouncementDraft } from "@/lib/announcements/validation";

async function patchHandler(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireAdminApi({
      permission: "announcements.manage",
    });
    const announcement = await updateAnnouncement({
      actorUserId: context.userId,
      announcementId: (await params).id,
      draft: parseAnnouncementDraft(await request.json()),
    });
    return NextResponse.json(announcement);
  } catch (error) {
    return announcementApiErrorResponse(error);
  }
}

async function deleteHandler(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireAdminApi({
      permission: "announcements.manage",
      recentMfa: true,
    });
    await deleteAnnouncementDraft({
      actorUserId: context.userId,
      announcementId: (await params).id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return announcementApiErrorResponse(error);
  }
}

export const PATCH = withRequestLogging("/api/manage/announcements/[id]", patchHandler);
export const DELETE = withRequestLogging("/api/manage/announcements/[id]", deleteHandler);
