import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminApi } from "@/lib/admin/api";
import { aiAdminApiErrorResponse } from "@/lib/ai/admin/api";
import { listAiAdminQuotas, updateAiAdminQuota } from "@/lib/ai/admin/service";
import { resolveAiConfiguration } from "@/lib/ai/config/configuration";
import { parsePageRequest } from "@/lib/shared/pagination";

const quotaSchema = z.object({
  userId: z.string().min(1).max(200),
  monthlyLimit: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict();

export async function GET(request: Request) {
  try {
    await requireAdminApi({ permission: "ai.quotas.manage" });
    const params = new URL(request.url).searchParams;
    const result = await listAiAdminQuotas(
      {
        ...parsePageRequest({
          page: params.get("page") ?? undefined,
          pageSize: params.get("pageSize") ?? undefined,
        }),
        query: params.get("q") ?? undefined,
      },
      resolveAiConfiguration(process.env).defaultMonthlyPoints,
    );
    return NextResponse.json(result);
  } catch (error) {
    return aiAdminApiErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireAdminApi({
      permission: "ai.quotas.manage",
      recentMfa: true,
    });
    const value = quotaSchema.parse(await request.json());
    return NextResponse.json(await updateAiAdminQuota({
      actorUserId: context.userId,
      ...value,
    }));
  } catch (error) {
    return aiAdminApiErrorResponse(error);
  }
}
