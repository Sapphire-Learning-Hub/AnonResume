import { toNextJsHandler } from "better-auth/next-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getSetupAccessDecision } from "@/lib/admin/setup/access";
import { getAuth } from "@/lib/auth/config";

export async function GET(request: NextRequest) {
  const blocked = await blockAuthDuringInitialSetup(request);
  if (blocked) return blocked;
  return toNextJsHandler(await getAuth()).GET(request);
}

export async function POST(request: NextRequest) {
  const blocked = await blockAuthDuringInitialSetup(request);
  if (blocked) return blocked;
  return toNextJsHandler(await getAuth()).POST(request);
}

async function blockAuthDuringInitialSetup(request: NextRequest) {
  const decision = await getSetupAccessDecision(new URL(request.url).pathname);
  if (decision === "require_setup") {
    return NextResponse.json(
      { error: "instance_setup_required" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return null;
}
