import { toNextJsHandler } from "better-auth/next-js";
import type { NextRequest } from "next/server";

import { getAuth } from "@/lib/auth/config";

export async function GET(request: NextRequest) {
  return toNextJsHandler(await getAuth()).GET(request);
}

export async function POST(request: NextRequest) {
  return toNextJsHandler(await getAuth()).POST(request);
}
