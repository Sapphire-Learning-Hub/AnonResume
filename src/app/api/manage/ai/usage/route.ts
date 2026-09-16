import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminApi } from "@/lib/admin/api";
import { aiAdminApiErrorResponse } from "@/lib/ai/admin/api";
import {
  listAiAdminLedger,
  listAiAdminUsage,
  resolveAiAdminSettlement,
} from "@/lib/ai/admin/service";
import { parsePageRequest } from "@/lib/shared/pagination";

const settlementSchema = z.object({
  runId: z.string().uuid(),
  decision: z.enum(["charge_reserved", "release"]),
}).strict();

export async function GET(request: Request) {
  try {
    await requireAdminApi({ permission: "ai.usage.read" });
    const params = new URL(request.url).searchParams;
    const requestInput = {
      ...parsePageRequest({
        page: params.get("page") ?? undefined,
        pageSize: params.get("pageSize") ?? undefined,
      }),
      query: params.get("q") ?? undefined,
      settlementPendingOnly: params.get("settlementPending") === "true",
    };
    const result = params.get("view") === "ledger"
      ? await listAiAdminLedger(requestInput)
      : await listAiAdminUsage(requestInput);
    return NextResponse.json(result);
  } catch (error) {
    return aiAdminApiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireAdminApi({
      permission: "ai.quotas.manage",
      recentMfa: true,
    });
    const value = settlementSchema.parse(await request.json());
    await resolveAiAdminSettlement({ actorUserId: context.userId, ...value });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return aiAdminApiErrorResponse(error);
  }
}
