import { withRequestLogging } from "@/lib/observability/http";

import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/admin/api";
import { announcementApiErrorResponse } from "@/lib/announcements/api";
import { withdrawAnnouncement } from "@/lib/announcements/management";

async function postHandler(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireAdminApi({
      permission: "announcements.manage",
      recentMfa: true,
    });
    const announcement = await withdrawAnnouncement({
      actorUserId: context.userId,
      announcementId: (await params).id,
    });
    return NextResponse.json(announcement);
  } catch (error) {
    return announcementApiErrorResponse(error);
  }
}

export const POST = withRequestLogging("/api/manage/announcements/[id]/withdraw", postHandler);
