import { withRequestLogging } from "@/lib/observability/http";

import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/admin/api";
import { aiAdminApiErrorResponse } from "@/lib/ai/admin/api";
import { listAiAdminModelRateVersions } from "@/lib/ai/admin/service";

async function getHandler(
  _request: Request,
  { params }: { params: Promise<{ id: string; modelId: string }> },
) {
  try {
    await requireAdminApi({ permission: "ai.providers.manage" });
    const { id, modelId } = await params;
    const result = await listAiAdminModelRateVersions({
      providerId: id,
      modelId,
    });
    return NextResponse.json(result);
  } catch (error) {
    return aiAdminApiErrorResponse(error);
  }
}

export const GET = withRequestLogging("/api/manage/ai/providers/[id]/models/[modelId]/rate-versions", getHandler);
