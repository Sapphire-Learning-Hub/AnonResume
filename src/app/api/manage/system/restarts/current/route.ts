import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/admin/api";
import { systemRestartApiErrorResponse } from "@/lib/admin/system-restart/api";
import { getCurrentSystemRestartOperation } from "@/lib/admin/system-restart/service";
import { resolveRuntimeIdentity } from "@/lib/runtime/instance-identity";

export async function GET() {
  try {
    await requireAdminApi({ permission: "system.read" });
    const identity = resolveRuntimeIdentity("web");
    return NextResponse.json(
      await getCurrentSystemRestartOperation({
        deploymentId: identity.deploymentId,
      }),
    );
  } catch (error) {
    return systemRestartApiErrorResponse(error);
  }
}
