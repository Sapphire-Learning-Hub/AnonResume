import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/admin/api";
import { aiAdminApiErrorResponse } from "@/lib/ai/admin/api";
import { getAiAdminAuditEvidence } from "@/lib/ai/admin/service";
import { resolveAiConfiguration } from "@/lib/ai/config/configuration";
import { getRuntimeConfig } from "@/lib/config/runtime";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const context = await requireAdminApi({
      permission: "ai.audit.sensitive.read",
      recentMfa: true,
    });
    const runtime = await getRuntimeConfig("web");
    const encryptionKey = resolveAiConfiguration(
      runtime.values,
    ).credentialsEncryptionKey;
    const evidence = await getAiAdminAuditEvidence({
      actorUserId: context.userId,
      runId: (await params).runId,
      encryptionKey,
    });
    return NextResponse.json(evidence);
  } catch (error) {
    return aiAdminApiErrorResponse(error);
  }
}
