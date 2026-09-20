import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminApi } from "@/lib/admin/api";
import { aiAdminApiErrorResponse } from "@/lib/ai/admin/api";
import { listAiAdminQuotas, updateAiAdminQuota } from "@/lib/ai/admin/service";
import { resolveAiConfiguration } from "@/lib/ai/config/configuration";
import { getRuntimeConfig } from "@/lib/config/runtime";
import {
  MAX_ACTION_REQUEST_BYTES,
  parseLimitedJsonRequest,
} from "@/lib/http/request-body";
import { requireSameOrigin } from "@/lib/http/request-origin";
import { parsePageRequest } from "@/lib/shared/pagination";

const quotaSchema = z.object({
  userId: z.string().min(1).max(200),
  monthlyLimit: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  periodStartedAt: z.coerce.date(),
  periodEndsAt: z.coerce.date(),
}).strict().refine(
  (value) => value.periodEndsAt > value.periodStartedAt,
  { message: "invalid_quota_period", path: ["periodEndsAt"] },
);

export async function GET(request: Request) {
  try {
    await requireAdminApi({ permission: "ai.quotas.manage" });
    const runtime = await getRuntimeConfig("web");
    const params = new URL(request.url).searchParams;
    const result = await listAiAdminQuotas(
      {
        ...parsePageRequest({
          page: params.get("page") ?? undefined,
          pageSize: params.get("pageSize") ?? undefined,
        }),
        query: params.get("q") ?? undefined,
      },
      resolveAiConfiguration(runtime.values).defaultMonthlyPoints,
    );
    return NextResponse.json(result);
  } catch (error) {
    return aiAdminApiErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const forbiddenResponse = requireSameOrigin(request);
    if (forbiddenResponse) return forbiddenResponse;
    const context = await requireAdminApi({
      permission: "ai.quotas.manage",
      recentMfa: true,
    });
    const value = quotaSchema.parse(
      await parseLimitedJsonRequest(request, MAX_ACTION_REQUEST_BYTES),
    );
    return NextResponse.json(await updateAiAdminQuota({
      actorUserId: context.userId,
      ...value,
    }));
  } catch (error) {
    return aiAdminApiErrorResponse(error);
  }
}
