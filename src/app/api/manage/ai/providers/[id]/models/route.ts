import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/admin/api";
import { aiAdminApiErrorResponse } from "@/lib/ai/admin/api";
import { createAiAdminModel } from "@/lib/ai/admin/service";
import { aiAdminModelSchema } from "@/lib/ai/admin/validation";
import {
  MAX_ACTION_REQUEST_BYTES,
  parseLimitedJsonRequest,
} from "@/lib/http/request-body";
import { requireSameOrigin } from "@/lib/http/request-origin";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const forbiddenResponse = requireSameOrigin(request);
    if (forbiddenResponse) return forbiddenResponse;
    const context = await requireAdminApi({
      permission: "ai.providers.manage",
      recentMfa: true,
    });
    const value = aiAdminModelSchema.parse(
      await parseLimitedJsonRequest(request, MAX_ACTION_REQUEST_BYTES),
    );
    const result = await createAiAdminModel({
      actorUserId: context.userId,
      providerId: (await params).id,
      value,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return aiAdminApiErrorResponse(error);
  }
}
