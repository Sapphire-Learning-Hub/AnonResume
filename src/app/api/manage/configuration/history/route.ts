import { withRequestLogging } from "@/lib/observability/http";

import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/admin/api";
import { configurationApiErrorResponse } from "@/lib/config/admin/api";
import { listConfigurationHistory } from "@/lib/config/admin/service";

async function getHandler() {
  try {
    await requireAdminApi({ permission: "configuration.history" });
    return NextResponse.json(await listConfigurationHistory());
  } catch (error) {
    return configurationApiErrorResponse(error);
  }
}

export const GET = withRequestLogging("/api/manage/configuration/history", getHandler);
