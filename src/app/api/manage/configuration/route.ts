import { withRequestLogging } from "@/lib/observability/http";

import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/admin/api";
import { configurationApiErrorResponse } from "@/lib/config/admin/api";
import {
  getManagedConfiguration,
  patchConfigurationDraft,
} from "@/lib/config/admin/service";
import { parseConfigurationDraftPatch } from "@/lib/config/admin/validation";
import {
  MAX_ACTION_REQUEST_BYTES,
  parseLimitedJsonRequest,
} from "@/lib/http/request-body";
import { requireSameOrigin } from "@/lib/http/request-origin";

async function getHandler() {
  try {
    await requireAdminApi({ permission: "configuration.read" });
    return NextResponse.json(await getManagedConfiguration());
  } catch (error) {
    return configurationApiErrorResponse(error);
  }
}

async function patchHandler(request: Request) {
  try {
    const forbiddenResponse = requireSameOrigin(request);
    if (forbiddenResponse) return forbiddenResponse;
    const context = await requireAdminApi({
      permission: "configuration.edit",
    });
    const patch = parseConfigurationDraftPatch(
      await parseLimitedJsonRequest(request, MAX_ACTION_REQUEST_BYTES),
    );
    return NextResponse.json(
      await patchConfigurationDraft({
        actorUserId: context.userId,
        ...patch,
      }),
    );
  } catch (error) {
    return configurationApiErrorResponse(error);
  }
}

export const GET = withRequestLogging("/api/manage/configuration", getHandler);
export const PATCH = withRequestLogging("/api/manage/configuration", patchHandler);
