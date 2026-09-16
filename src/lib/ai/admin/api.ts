import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { adminApiErrorResponse } from "@/lib/admin/api";

import { AiAdminNotFoundError, AiAdminStateConflictError } from "./service";

export function aiAdminApiErrorResponse(error: unknown) {
  const authorization = adminApiErrorResponse(error);
  if (authorization) return authorization;
  if (error instanceof ZodError || error instanceof SyntaxError) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (error instanceof AiAdminNotFoundError) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (error instanceof AiAdminStateConflictError) {
    return NextResponse.json({ error: "invalid_state" }, { status: 409 });
  }
  if (error instanceof Error && error.message === "ai_api_key_required") {
    return NextResponse.json({ error: "api_key_required" }, { status: 400 });
  }
  if (error instanceof Error && error.message === "unsafe_ai_endpoint") {
    return NextResponse.json({ error: "unsafe_endpoint" }, { status: 400 });
  }
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}
