import { describe, expect, it } from "vitest";

import {
  getLogContext,
  getLogger,
  initializeLogging,
  runWithLogContext,
} from "@/lib/observability/logging";

function createLineDestination() {
  const lines: string[] = [];

  return {
    destination: {
      write(line: string) {
        lines.push(line);
      },
    },
    lines,
  };
}

describe("structured logging runtime", () => {
  it("emits the stable ECS-compatible base event fields", () => {
    const { destination, lines } = createLineDestination();
    initializeLogging({
      destination,
      identity: {
        deploymentId: "test-deployment",
        instanceId: "pdf-1",
        role: "pdf-worker",
        sessionId: "session-1",
        stableId: "test-deployment/pdf-worker/pdf-1",
      },
      role: "pdf-worker",
    });

    getLogger("anonresume.pdf").info(
      "pdf_export_completed",
      { outcome: "success", transactionId: "job-1" },
      "PDF export completed",
    );

    expect(lines).toHaveLength(1);
    const line = lines[0] ?? "{}";
    expect(line.match(/"ecs\.version"/g)).toHaveLength(1);
    expect(line.match(/"event\.dataset"/g)).toHaveLength(1);
    const event = JSON.parse(line) as Record<string, unknown>;
    expect(event).toMatchObject({
      "ecs.version": "8.17.0",
      "event.action": "pdf_export_completed",
      "event.dataset": "anonresume.pdf",
      "event.outcome": "success",
      "log.level": "info",
      "service.deployment.id": "test-deployment",
      "service.environment": "test",
      "service.name": "anonresume-pdf-worker",
      "service.node.name": "pdf-1",
      message: "PDF export completed",
      "transaction.id": "job-1",
    });
    expect(event["@timestamp"]).toEqual(expect.any(String));
    expect(event["service.version"]).toEqual(expect.any(String));
  });

  it("propagates request context through asynchronous work", async () => {
    await runWithLogContext(
      { method: "POST", path: "/api/resumes/[id]", requestId: "request-1" },
      async () => {
        await Promise.resolve();
        expect(getLogContext()).toEqual({
          method: "POST",
          path: "/api/resumes/[id]",
          requestId: "request-1",
        });
      },
    );

    expect(getLogContext()).toBeUndefined();
  });

  it("removes query and fragment values from contextual paths", () => {
    const { destination, lines } = createLineDestination();
    initializeLogging({
      destination,
      identity: {
        deploymentId: "test-deployment",
        instanceId: "web-1",
        role: "web",
        sessionId: "session-1",
        stableId: "test-deployment/web/web-1",
      },
      role: "web",
    });

    runWithLogContext(
      {
        method: "GET",
        path: "/api/auth/callback?code=private-value#result",
        requestId: "request-1",
      },
      () => getLogger("anonresume.http").info("request_completed"),
    );

    const line = lines[0] ?? "";
    expect(line).not.toContain("private-value");
    expect(JSON.parse(line)).toMatchObject({
      "url.path": "/api/auth/callback",
    });
  });

  it("applies central redaction before writing caller fields", () => {
    const { destination, lines } = createLineDestination();
    initializeLogging({
      destination,
      identity: {
        deploymentId: "test-deployment",
        instanceId: "web-1",
        role: "web",
        sessionId: "session-1",
        stableId: "test-deployment/web/web-1",
      },
      role: "web",
    });

    getLogger("anonresume.web").warn(
      "request_failed",
      {
        details: { nested: { password: "private-value" } },
        labels: { accessToken: "private-value", retryable: true },
      },
      "Request failed",
    );

    expect(lines).toHaveLength(1);
    const line = lines[0] ?? "";
    const event = JSON.parse(line) as Record<string, unknown>;
    expect(line).not.toContain("private-value");
    expect(event).toMatchObject({
      "labels.accessToken": "[REDACTED]",
      "labels.retryable": true,
      nested: { password: "[REDACTED]" },
    });
  });
});
