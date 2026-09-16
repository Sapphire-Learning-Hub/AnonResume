import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { adminApiErrorResponse } from "@/lib/admin/api";
import { AnnouncementNotFoundError } from "@/lib/announcements/management";
import {
  AnnouncementActiveLimitError,
  AnnouncementStateConflictError,
} from "@/lib/announcements/rules";

export function announcementApiErrorResponse(error: unknown) {
  const authError = adminApiErrorResponse(error);
  if (authError) return authError;
  if (error instanceof ZodError || error instanceof SyntaxError) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (error instanceof AnnouncementNotFoundError) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (error instanceof AnnouncementActiveLimitError) {
    return NextResponse.json({ error: "active_limit" }, { status: 409 });
  }
  if (error instanceof AnnouncementStateConflictError) {
    return NextResponse.json({ error: "invalid_state" }, { status: 409 });
  }
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}
