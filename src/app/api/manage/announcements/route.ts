import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/admin/api";
import { announcementApiErrorResponse } from "@/lib/announcements/api";
import {
  createAnnouncement,
  listManagedAnnouncements,
} from "@/lib/announcements/management";
import { parseAnnouncementDraft } from "@/lib/announcements/validation";
import { parsePageRequest } from "@/lib/shared/pagination";

export async function GET(request: Request) {
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

export async function POST(request: Request) {
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
