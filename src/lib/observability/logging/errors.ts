import { createHash } from "node:crypto";

import type { SafeErrorFields } from "./types";

const UNKNOWN_ERROR_MESSAGE = "Unexpected application error";
const MAX_STACK_FRAMES = 16;
const MAX_STACK_FRAME_LENGTH = 512;

const SAFE_ERROR_MESSAGES = {
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
    return /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(name) ? name : "Error";
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

function sanitizeStack(error: Error) {
  if (!error.stack) {
    return undefined;
  }

  const frames = error.stack
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("at "))
    .slice(0, MAX_STACK_FRAMES)
    .map((line) => line.slice(0, MAX_STACK_FRAME_LENGTH));

  return frames.length > 0 ? frames.join("\n") : undefined;
}

export function serializeSafeError(error: unknown): SafeErrorFields {
  const type = errorType(error);
  const code = readSafeCode(error);

  return {
    code,
    digest: errorFingerprint(error, type, code),
    message: code ? SAFE_ERROR_MESSAGES[code] : UNKNOWN_ERROR_MESSAGE,
    stackTrace: error instanceof Error ? sanitizeStack(error) : undefined,
    type,
  };
}
