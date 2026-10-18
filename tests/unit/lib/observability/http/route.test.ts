import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  REQUEST_ID_HEADER,
  UPSTREAM_REQUEST_ID_HEADER,
  withRequestLogging,
} from "@/lib/observability/http";
import { initializeLogging } from "@/lib/observability/logging";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createLogCapture() {
  const lines: string[] = [];
  initializeLogging({
    destination: {
      write(line: string) {
        lines.push(line);
      },
    },
    identity: {
      deploymentId: "test-deployment",
      instanceId: "web-1",
      role: "web",
      sessionId: "session-1",
      stableId: "test-deployment/web/web-1",
    },
    role: "web",
  });

  return {
    events: () =>
      lines.map((line) => JSON.parse(line) as Record<string, unknown>),
    lines,
  };
}

describe("route request logging", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("logs a successful response with correlation and elapsed duration", async () => {
    const capture = createLogCapture();
    const now = vi.spyOn(performance, "now");
    now.mockReturnValueOnce(100).mockReturnValueOnce(125.5);
    const requestId = "123e4567-e89b-42d3-a456-426614174000";
    const handler = withRequestLogging(
      "/api/resumes/[id]",
      async (_request, context: { params: Promise<{ id: string }> }) => {
        expect(await context.params).toEqual({ id: "resume-1" });
        return new Response("private-response-body", {
          headers: { "x-existing": "preserved" },
          status: 201,
        });
      },
    );

    const response = await handler(
      new Request("https://resume.example.com/api/resumes/resume-1?token=secret", {
        headers: {
          [REQUEST_ID_HEADER]: requestId,
          [UPSTREAM_REQUEST_ID_HEADER]: "gateway-request-1",
        },
      }),
      { params: Promise.resolve({ id: "resume-1" }) },
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("x-existing")).toBe("preserved");
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe(requestId);
    await expect(response.text()).resolves.toBe("private-response-body");
    expect(capture.lines.join("\n")).not.toContain("private-response-body");
    expect(capture.lines.join("\n")).not.toContain("token=secret");
    expect(capture.events()).toHaveLength(1);
    expect(capture.events()[0]).toMatchObject({
      "event.action": "http_request_completed",
      "event.dataset": "anonresume.http",
      "event.duration": 25_500_000,
      "event.outcome": "success",
      "http.request.id": "gateway-request-1",
      "http.request.method": "GET",
      "http.response.status_code": 201,
      "request.id": requestId,
      "url.path": "/api/resumes/[id]",
    });
  });

  it.each([
    [404, "warn"],
    [503, "error"],
  ])("records HTTP %i responses as failures", async (status, level) => {
    const capture = createLogCapture();
    const handler = withRequestLogging("/api/example", () =>
      Response.json({ error: "not_exposed" }, { status }),
    );

    const response = await handler();

    expect(response.status).toBe(status);
    expect(capture.events()[0]).toMatchObject({
      "event.outcome": "failure",
      "http.response.status_code": status,
      "log.level": level,
    });
    expect(capture.lines.join("\n")).not.toContain("not_exposed");
  });

  it("generates correlation when invoked without Proxy", async () => {
    const capture = createLogCapture();
    const handler = withRequestLogging("/api/direct", () =>
      new Response(null, { status: 204 }),
    );

    const response = await handler();

    const requestId = response.headers.get(REQUEST_ID_HEADER) ?? "";
    expect(requestId).toMatch(UUID_PATTERN);
    expect(capture.events()[0]?.["request.id"]).toBe(requestId);
  });

  it("does not consume request or streaming response bodies", async () => {
    const capture = createLogCapture();
    const request = new Request("https://resume.example.com/api/stream", {
      body: "private-request-body",
      method: "POST",
    });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("streamed-secret"));
        controller.close();
      },
    });
    const original = new Response(stream, {
      headers: { "content-type": "text/event-stream" },
    });
    const handler = withRequestLogging("/api/stream", (input: Request) => {
      expect(input.bodyUsed).toBe(false);
      return original;
    });

    const response = await handler(request);

    expect(request.bodyUsed).toBe(false);
    expect(response).toBe(original);
    expect(response.body?.locked).toBe(false);
    expect(capture.lines.join("\n")).not.toContain("private-request-body");
    expect(capture.lines.join("\n")).not.toContain("streamed-secret");
    await expect(response.text()).resolves.toBe("streamed-secret");
  });

  it("logs sanitized thrown errors and preserves the thrown value", async () => {
    const capture = createLogCapture();
    const thrown = new Error("database password is hunter2");
    const handler = withRequestLogging("/api/failure", () => {
      throw thrown;
    });

    await expect(
      handler(),
    ).rejects.toBe(thrown);

    expect(capture.events()).toHaveLength(1);
    expect(capture.events()[0]).toMatchObject({
      "error.message": "Unexpected application error",
      "error.type": "Error",
      "event.action": "http_request_failed",
      "event.outcome": "failure",
      "log.level": "error",
    });
    expect(capture.lines.join("\n")).not.toContain("hunter2");
  });

  it("suppresses successful health access logs but retains failures", async () => {
    const capture = createLogCapture();
    const healthy = withRequestLogging(
      "/api/health/ready",
      () => Response.json({ status: "ready" }),
      { suppressSuccessfulAccessLog: true },
    );
    const unhealthy = withRequestLogging(
      "/api/health/ready",
      () => Response.json({ status: "unavailable" }, { status: 503 }),
      { suppressSuccessfulAccessLog: true },
    );

    await healthy();
    expect(capture.events()).toHaveLength(0);

    await unhealthy();
    expect(capture.events()).toHaveLength(1);
    expect(capture.events()[0]).toMatchObject({
      "event.outcome": "failure",
      "http.response.status_code": 503,
    });
  });
});
