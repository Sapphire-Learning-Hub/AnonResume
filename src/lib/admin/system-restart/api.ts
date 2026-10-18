import { NextResponse } from "next/server";
import { ZodError, z } from "zod";

import { adminApiErrorResponse } from "@/lib/admin/api";
import { SystemRestartOperationError } from "@/lib/admin/system-restart/errors";
import { RequestBodyTooLargeError } from "@/lib/http/request-body";
import {
  getLogger,
  serializeSafeError,
} from "@/lib/observability/logging";

const configurationLog = getLogger("anonresume.configuration");

const systemRestartRequestSchema = z
  .object({ idempotencyKey: z.string().uuid() })
  .strict();

export function parseSystemRestartRequest(value: unknown) {
  return systemRestartRequestSchema.parse(value);
}

export function systemRestartApiErrorResponse(error: unknown) {
  const authError = adminApiErrorResponse(error);
  if (authError) return authError;
  if (
    error instanceof ZodError ||
    error instanceof SyntaxError ||
    error instanceof RequestBodyTooLargeError
  ) {
    return NextResponse.json(
      { error: "system_restart_invalid" },
      { status: 400 },
    );
  }
  if (error instanceof SystemRestartOperationError) {
    return NextResponse.json(
      { error: error.code },
      { status: error.code === "configuration_unavailable" ? 503 : 409 },
    );
  }

  configurationLog.error("restart_operation_failed", {
    error: serializeSafeError(error),
    outcome: "failure",
  });
  return NextResponse.json(
    { error: "system_restart_failed" },
    { status: 500 },
  );
}
