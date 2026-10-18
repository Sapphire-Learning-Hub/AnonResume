import { withRequestLogging } from "@/lib/observability/http";

import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/admin/api";
import {
  parseSystemRestartRequest,
  systemRestartApiErrorResponse,
} from "@/lib/admin/system-restart/api";
import { createSystemRestartOperation } from "@/lib/admin/system-restart/service";
import {
  MAX_ACTION_REQUEST_BYTES,
  parseLimitedJsonRequest,
} from "@/lib/http/request-body";
import { requireSameOrigin } from "@/lib/http/request-origin";
import { resolveRuntimeIdentity } from "@/lib/runtime/instance-identity";

async function postHandler(request: Request) {
  try {
    const forbiddenResponse = requireSameOrigin(request);
    if (forbiddenResponse) return forbiddenResponse;
    const context = await requireAdminApi({
      permission: "system.restart",
      recentMfa: true,
    });
    const input = parseSystemRestartRequest(
      await parseLimitedJsonRequest(request, MAX_ACTION_REQUEST_BYTES),
    );
    const identity = resolveRuntimeIdentity("web");

    return NextResponse.json(
      await createSystemRestartOperation({
        actorUserId: context.userId,
        deploymentId: identity.deploymentId,
        idempotencyKey: input.idempotencyKey,
      }),
    );
  } catch (error) {
    return systemRestartApiErrorResponse(error);
  }
}

export const POST = withRequestLogging("/api/manage/system/restarts", postHandler);
