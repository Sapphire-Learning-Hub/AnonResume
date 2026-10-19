import type {
  LogFields,
  LogScalar,
  LogValue,
  SafeErrorFields,
} from "./types";

const REDACTED = "[REDACTED]";
const CIRCULAR = "[CIRCULAR]";
const MAX_DEPTH_VALUE = "[MAX_DEPTH]";
const MAX_DEPTH = 6;
const MAX_COLLECTION_SIZE = 32;
const MAX_STRING_LENGTH = 1_024;
const MAX_KEY_LENGTH = 128;
const UNSAFE_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const RESERVED_DETAIL_KEYS = /^(?:@|ecs\.|event\.|error\.|http\.|labels\.|log\.|request\.|service\.|transaction\.|diagnostic\.|trace\.|span\.|url\.|key_id$|status_code$)/i;
const SENSITIVE_NAMES = [
  "authorization",
  "body",
  "content",
  "cookie",
  "credential",
  "document",
  "email",
  "passphrase",
  "password",
  "payload",
  "privatekey",
  "prompt",
  "recoverycode",
  "secret",
  "setcookie",
  "setupcode",
  "token",
  "verificationcode",
];

function normalizeKey(key: string) {
  return key.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

function isSensitiveKey(key: string) {
  const normalized = normalizeKey(key);
  return SENSITIVE_NAMES.some((name) => normalized.includes(name));
}

function truncate(value: string) {
  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_STRING_LENGTH - 3)}...`;
}

function sanitizeValue(
  value: LogValue,
  depth: number,
  ancestors: WeakSet<object>,
): LogValue {
  if (typeof value === "string") {
    return truncate(value);
  }
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (depth >= MAX_DEPTH) {
    return MAX_DEPTH_VALUE;
  }
  if (ancestors.has(value)) {
    return CIRCULAR;
  }

  ancestors.add(value);
  let sanitized: LogValue;
  if (Array.isArray(value)) {
    sanitized = value
      .slice(0, MAX_COLLECTION_SIZE)
      .map((item) => sanitizeValue(item, depth + 1, ancestors));
  } else {
    const result: Record<string, LogValue> = {};
    for (const [key, nestedValue] of Object.entries(value).slice(
      0,
      MAX_COLLECTION_SIZE,
    )) {
      if (
        key.length > MAX_KEY_LENGTH ||
        RESERVED_DETAIL_KEYS.test(key) ||
        UNSAFE_OBJECT_KEYS.has(key)
      ) {
        continue;
      }
      result[key] = isSensitiveKey(key)
        ? REDACTED
        : sanitizeValue(nestedValue, depth + 1, ancestors);
    }
    sanitized = result;
  }
  ancestors.delete(value);
  return sanitized;
}

function sanitizeOptionalString(value: string | undefined) {
  return value === undefined ? undefined : truncate(value);
}

function sanitizePath(value: string | undefined) {
  return value === undefined
    ? undefined
    : truncate(value.split(/[?#]/, 1)[0] ?? "");
}

function sanitizeError(error: SafeErrorFields | undefined) {
  if (!error) {
    return undefined;
  }

  return {
    causes: error.causes?.slice(0, 4).map((cause) => ({ ...cause, stackTrace: sanitizeOptionalString(cause.stackTrace) })),
    code: sanitizeOptionalString(error.code),
    digest: sanitizeOptionalString(error.digest),
    message: truncate(error.message),
    stackTrace: sanitizeOptionalString(error.stackTrace),
    type: sanitizeOptionalString(error.type),
  } satisfies SafeErrorFields;
}

function sanitizeLabels(labels: LogFields["labels"]) {
  if (!labels) {
    return undefined;
  }

  const result: Record<string, LogScalar> = {};
  for (const [key, value] of Object.entries(labels).slice(
    0,
    MAX_COLLECTION_SIZE,
  )) {
    if (key.length > MAX_KEY_LENGTH || RESERVED_DETAIL_KEYS.test(key)) {
      continue;
    }
    result[key] = isSensitiveKey(key)
      ? REDACTED
      : typeof value === "string"
        ? truncate(value)
        : value;
  }
  return result;
}

export function redactLogFields(fields: LogFields): LogFields {
  return {
    details: fields.details
      ? (sanitizeValue(fields.details, 0, new WeakSet()) as Readonly<
          Record<string, LogValue>
        >)
      : undefined,
    durationNs: fields.durationNs,
    error: sanitizeError(fields.error),
    keyId: sanitizeOptionalString(fields.keyId),
    labels: sanitizeLabels(fields.labels),
    method: sanitizeOptionalString(fields.method),
    outcome: fields.outcome,
    path: sanitizePath(fields.path),
    requestId: sanitizeOptionalString(fields.requestId),
    statusCode: fields.statusCode,
    transactionId: sanitizeOptionalString(fields.transactionId),
    upstreamRequestId: sanitizeOptionalString(fields.upstreamRequestId),
  };
}
