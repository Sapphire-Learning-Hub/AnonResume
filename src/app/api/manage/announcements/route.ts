import { withRequestLogging } from "@/lib/observability/http";

import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/admin/api";
import { announcementApiErrorResponse } from "@/lib/announcements/api";
import {
  createAnnouncement,
  listManagedAnnouncements,
} from "@/lib/announcements/management";
import { parseAnnouncementDraft } from "@/lib/announcements/validation";
import { parsePageRequest } from "@/lib/shared/pagination";

async function getHandler(request: Request) {
  try {
    await requireAdminApi({ permission: "announcements.read" });
    const searchParams = new URL(request.url).searchParams;
    const announcements = await listManagedAnnouncements({
      ...parsePageRequest({
        page: searchParams.get("page") ?? undefined,
        pageSize: searchParams.get("pageSize") ?? undefined,
      }),
      query: searchParams.get("q") ?? undefined,
    });
    return NextResponse.json(announcements);
  } catch (error) {
    return announcementApiErrorResponse(error);
  }
}

async function postHandler(request: Request) {
  try {
    const context = await requireAdminApi({
      permission: "announcements.manage",
    });
    const announcement = await createAnnouncement({
      actorUserId: context.userId,
      draft: parseAnnouncementDraft(await request.json()),
    });
    return NextResponse.json(announcement, { status: 201 });
  } catch (error) {
    return announcementApiErrorResponse(error);
  }
}

export const GET = withRequestLogging("/api/manage/announcements", getHandler);
export const POST = withRequestLogging("/api/manage/announcements", postHandler);
