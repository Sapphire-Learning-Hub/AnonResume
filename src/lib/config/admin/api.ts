import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { adminApiErrorResponse } from "@/lib/admin/api";
import { RequestBodyTooLargeError } from "@/lib/http/request-body";
import {
  ConfigurationRevisionConflictError,
  ConfigurationStateError,
} from "@/lib/config/store";

import { ConfigurationValidationError } from "./validation";

export function configurationApiErrorResponse(error: unknown) {
  const authError = adminApiErrorResponse(error);
  if (authError) return authError;
  if (
    error instanceof ConfigurationValidationError ||
    error instanceof ZodError ||
    error instanceof SyntaxError ||
    error instanceof RequestBodyTooLargeError
  ) {
    return NextResponse.json(
      { error: "configuration_invalid" },
      { status: 400 },
    );
  }
  if (error instanceof ConfigurationRevisionConflictError) {
    return NextResponse.json(
      { error: "configuration_conflict" },
      { status: 409 },
    );
  }
  if (
    error instanceof ConfigurationStateError &&
    error.message === "configuration_revision_not_found"
  ) {
    return NextResponse.json(
      { error: "configuration_not_found" },
      { status: 404 },
    );
  }

  console.error("[AnonResume][configuration] operation failed", {
    errorType: error instanceof Error ? error.name : typeof error,
  });
  return NextResponse.json(
    { error: "configuration_operation_failed" },
    { status: 500 },
  );
}
