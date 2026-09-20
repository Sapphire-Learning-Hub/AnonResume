import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/admin/api";
import { configurationApiErrorResponse } from "@/lib/config/admin/api";
import { listConfigurationHistory } from "@/lib/config/admin/service";

export async function GET() {
  try {
    await requireAdminApi({ permission: "configuration.history" });
    return NextResponse.json(await listConfigurationHistory());
  } catch (error) {
    return configurationApiErrorResponse(error);
  }
}
