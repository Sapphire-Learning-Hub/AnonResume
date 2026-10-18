import { withRequestLogging } from "@/lib/observability/http";

import { NextResponse } from "next/server";

import { checkApplicationReadiness } from "@/lib/runtime/health";

async function getHandler() {
  const readiness = await checkApplicationReadiness();
  return NextResponse.json(
    readiness.ready
      ? { status: "ready", setupRequired: readiness.setupRequired }
      : { status: "unavailable", reason: readiness.reason },
    {
      status: readiness.ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export const GET = withRequestLogging("/api/health/ready", getHandler, { suppressSuccessfulAccessLog: true });
