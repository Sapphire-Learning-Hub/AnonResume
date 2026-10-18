import { withRequestLogging } from "@/lib/observability/http";

import { NextResponse } from "next/server";

import { inspectPublicSetupStatus } from "@/lib/admin/setup/session";

async function getHandler() {
  return NextResponse.json(await inspectPublicSetupStatus(), {
    headers: { "Cache-Control": "no-store" },
  });
}

export const GET = withRequestLogging("/api/setup/status", getHandler);
