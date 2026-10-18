import { withRequestLogging } from "@/lib/observability/http";

import { NextResponse } from "next/server";

function getHandler() {
  return NextResponse.json(
    { status: "alive" },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const GET = withRequestLogging("/api/health/live", getHandler, { suppressSuccessfulAccessLog: true });
