import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/admin/api";
import { configurationApiErrorResponse } from "@/lib/config/admin/api";
import { prepareConfigurationRollback } from "@/lib/config/admin/service";
import { requireSameOrigin } from "@/lib/http/request-origin";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const forbiddenResponse = requireSameOrigin(request);
    if (forbiddenResponse) return forbiddenResponse;
    const context = await requireAdminApi({
      permission: "configuration.rollback",
      recentMfa: true,
    });
    return NextResponse.json(
      await prepareConfigurationRollback({
        actorUserId: context.userId,
        sourceRevisionId: (await params).id,
      }),
    );
  } catch (error) {
    return configurationApiErrorResponse(error);
  }
}
