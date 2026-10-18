import { describe, expect, it } from "vitest";

import {
  initializeLogging,
  redactLogFields,
  serializeSafeError,
  writeLocalSensitiveEvent,
  type LogValue,
} from "@/lib/observability/logging";

describe("structured log redaction", () => {
  it("redacts sensitive names recursively in objects and arrays", () => {
    const result = redactLogFields({
      details: {
        account: {
          authorization: "Bearer private",
          nested: [
            { email: "person@example.com", outcome: "failure" },
            { password: "private", token: "private" },
          ],
        },
        safe: "retained",
      },
    });

    expect(result.details).toEqual({
      account: {
        authorization: "[REDACTED]",
        nested: [
          { email: "[REDACTED]", outcome: "failure" },
          { password: "[REDACTED]", token: "[REDACTED]" },
        ],
      },
      safe: "retained",
    });
  });

  it("bounds circular, deeply nested, oversized, and wide values", () => {
    const circular: Record<string, LogValue> = {};
    circular.self = circular;
    const result = redactLogFields({
      details: {
        circular,
        deep: { one: { two: { three: { four: { five: { six: { seven: "hidden" } } } } } } },
        long: "x".repeat(4_000),
        many: Array.from({ length: 80 }, (_, index) => index),
      },
    });

    expect(result.details?.circular).toEqual({ self: "[CIRCULAR]" });
    expect(JSON.stringify(result.details?.deep)).not.toContain("hidden");
    expect(String(result.details?.long).length).toBeLessThanOrEqual(1_025);
    expect(result.details?.many).toHaveLength(32);
  });

  it("keeps operational values only through their typed slots", () => {
    const result = redactLogFields({
      details: {
        "error.code": "untrusted_error",
        key_id: "untrusted-key",
        status_code: 401,
      },
      error: { code: "provider_timeout", message: "Provider timed out" },
      keyId: "key-v2",
      statusCode: 503,
    });

    expect(result).toMatchObject({
      error: { code: "provider_timeout", message: "Provider timed out" },
      keyId: "key-v2",
      statusCode: 503,
    });
    expect(result.details).toEqual({});
  });
});

describe("safe error serialization", () => {
  it("does not expose an unknown thrown string", () => {
    const result = serializeSafeError("password=secret-value");

    expect(result).toMatchObject({
      message: "Unexpected application error",
      type: "NonError",
    });
    expect(JSON.stringify(result)).not.toContain("secret-value");
    expect(result.digest).toMatch(/^[a-f0-9]{16}$/);
  });

  it("removes an unknown Error message while retaining bounded stack frames", () => {
    const error = new Error("token=secret-value");
    error.stack = [
      "Error: token=secret-value",
      "    at operation (/srv/anonresume/worker.ts:10:2)",
      "    at main (/srv/anonresume/worker.ts:20:4)",
    ].join("\n");

    const result = serializeSafeError(error);

    expect(result).toMatchObject({
      message: "Unexpected application error",
      type: "Error",
    });
    expect(result.stackTrace).toContain("at operation");
    expect(JSON.stringify(result)).not.toContain("secret-value");
  });

  it("maps a reviewed application error code to a safe message", () => {
    const error = Object.assign(new Error("provider included a credential"), {
      code: "operation_timeout",
    });

    expect(serializeSafeError(error)).toMatchObject({
      code: "operation_timeout",
      message: "Operation timed out",
      type: "Error",
    });
  });
});

describe("local sensitive log delivery", () => {
  it("marks the event as non-centralizable while preserving its operator message", () => {
    const lines: string[] = [];
    initializeLogging({
      destination: { write: (line) => lines.push(line) },
      identity: {
        deploymentId: "test-deployment",
        instanceId: "web-1",
        role: "web",
        sessionId: "session-1",
        stableId: "test-deployment/web/web-1",
      },
      role: "web",
    });

    writeLocalSensitiveEvent({
      action: "setup_code_issued",
      message: "Setup code: 123456",
    });

    const event = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
    expect(event).toMatchObject({
      "event.action": "setup_code_issued",
      "event.dataset": "anonresume.local",
      "labels.centralize": false,
      message: "Setup code: 123456",
    });
  });
});
