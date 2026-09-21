import { NextResponse } from "next/server";

import { inspectPublicSetupStatus } from "@/lib/admin/setup/session";

export async function GET() {
  return NextResponse.json(await inspectPublicSetupStatus(), {
    headers: { "Cache-Control": "no-store" },
  });
}
