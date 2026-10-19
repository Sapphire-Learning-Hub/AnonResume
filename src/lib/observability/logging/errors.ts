import { createHash } from "node:crypto";

import type { SafeErrorFields } from "./types";
import { safeServerFrames } from "@/lib/observability/diagnostics/frames";

const UNKNOWN_ERROR_MESSAGE = "Unexpected application error";

const SAFE_ERROR_MESSAGES = {
  ECONNREFUSED: "Dependency connection refused",
  ECONNRESET: "Dependency connection reset",
  ENOTFOUND: "Dependency DNS lookup failed",
  EAI_AGAIN: "Dependency DNS lookup temporarily unavailable",
  ETIMEDOUT: "Dependency connection timed out",
  CERT_HAS_EXPIRED: "Dependency TLS certificate expired",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "Dependency TLS verification failed",
  EAUTH: "Mail service authentication failed",
  ETLS: "Mail service TLS negotiation failed",
  ESOCKET: "Mail service connection failed",
  "23505": "Database uniqueness conflict",
  "23503": "Database reference constraint conflict",
  "40001": "Database serialization conflict",
  "40P01": "Database deadlock detected",
  "53300": "Database connection limit exceeded",
  "08006": "Database connection failed",
  "42P01": "Database schema table missing",
  "42703": "Database schema column missing",
  "28P01": "Database authentication failed",
  "3D000": "Database does not exist",
  "57P01": "Database connection terminated",
  "57014": "Database operation cancelled",
  timeout: "Upstream response timed out",
  authentication: "Upstream authentication failed",
  unavailable: "Upstream service unavailable",
  invalid_response: "Upstream response protocol invalid",
  context_limit: "Upstream context limit exceeded",
  aborted: "Operation aborted",
  operation_conflict: "Operation conflicts with the current state",
  operation_timeout: "Operation timed out",
  rate_limited: "Request rate limit exceeded",
  request_forbidden: "Request is not permitted",
  request_invalid: "Request is invalid",
  request_unauthorized: "Request is not authorized",
  resource_not_found: "Requested resource was not found",
  service_unavailable: "Service is temporarily unavailable",
} as const;

type SafeErrorCode = keyof typeof SAFE_ERROR_MESSAGES;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readSafeCode(error: unknown): SafeErrorCode | undefined {
  if (!isRecord(error) || typeof error.code !== "string") {
    return undefined;
  }

  return Object.hasOwn(SAFE_ERROR_MESSAGES, error.code)
    ? (error.code as SafeErrorCode)
    : undefined;
}

function errorType(error: unknown) {
  if (error instanceof Error) {
    const name = error.name.trim();
    return ["Error", "TypeError", "RangeError", "SyntaxError", "ReferenceError", "URIError", "AggregateError", "DOMException", "AiProviderError", "ZodError", "DrizzleQueryError"].includes(name) ? name : "Error";
  }

  return "NonError";
}

function errorFingerprint(error: unknown, type: string, code?: string) {
  const raw = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : Object.prototype.toString.call(error);
  return createHash("sha256")
    .update(`${type}\0${code ?? ""}\0${raw}`)
    .digest("hex")
    .slice(0, 16);
}

export function serializeSafeError(error: unknown): SafeErrorFields {
  const type = errorType(error);
  const code = readSafeCode(error);

  const causes: Array<Omit<SafeErrorFields, "causes">> = [];
  const seen = new Set<unknown>([error]);
  let cause = error instanceof Error ? error.cause : undefined;
  while (cause instanceof Error && !seen.has(cause) && causes.length < 4) {
    seen.add(cause);
    const causeCode = readSafeCode(cause);
    causes.push({ type: errorType(cause), code: causeCode, message: causeCode ? SAFE_ERROR_MESSAGES[causeCode] : UNKNOWN_ERROR_MESSAGE, stackTrace: safeServerFrames(cause.stack) });
    cause = cause.cause;
  }
  return {
    ...(causes.length ? { causes } : {}),
    code,
    digest: errorFingerprint(error, type, code),
    message: code ? SAFE_ERROR_MESSAGES[code] : UNKNOWN_ERROR_MESSAGE,
    stackTrace: error instanceof Error ? safeServerFrames(error.stack) : undefined,
    type,
  };
}
