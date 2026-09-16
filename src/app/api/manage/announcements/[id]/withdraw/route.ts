import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/admin/api";
import { announcementApiErrorResponse } from "@/lib/announcements/api";
import { withdrawAnnouncement } from "@/lib/announcements/management";

export async function POST(
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
