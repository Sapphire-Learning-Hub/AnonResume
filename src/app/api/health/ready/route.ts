import { NextResponse } from "next/server";

import { checkApplicationReadiness } from "@/lib/runtime/health";

export async function GET() {
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
