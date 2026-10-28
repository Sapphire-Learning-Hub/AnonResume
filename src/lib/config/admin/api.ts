import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { adminApiErrorResponse } from "@/lib/admin/api";
import { RequestBodyTooLargeError } from "@/lib/http/request-body";
import {
  ConfigurationRevisionConflictError,
  ConfigurationStateError,
} from "@/lib/config/store";
import {
  getLogger,
  serializeSafeError,
} from "@/lib/observability/logging";

import { ConfigurationValidationError } from "./validation";
import { MetricsConfigurationValidationError } from "@/lib/config/observability";

const configurationLog = getLogger("anonresume.configuration");

export function configurationApiErrorResponse(error: unknown) {
  const authError = adminApiErrorResponse(error);
  if (authError) return authError;
  if (
    error instanceof ConfigurationValidationError ||
    error instanceof MetricsConfigurationValidationError ||
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
  if (error instanceof ConfigurationStateError && error.message === "image_storage_in_use") return NextResponse.json({ error: "image_storage_in_use" }, { status: 409 });
  if (
    error instanceof ConfigurationStateError &&
    error.message === "configuration_revision_not_found"
  ) {
    return NextResponse.json(
      { error: "configuration_not_found" },
      { status: 404 },
    );
  }

  configurationLog.error("operation_failed", {
    error: serializeSafeError(error),
    outcome: "failure",
  });
  return NextResponse.json(
    { error: "configuration_operation_failed" },
    { status: 500 },
  );
}
