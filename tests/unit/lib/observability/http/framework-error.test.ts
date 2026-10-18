import { describe, expect, it } from "vitest";

import { logNextRequestError } from "@/lib/observability/http/framework-error";
import { initializeLogging } from "@/lib/observability/logging";

describe("Next.js request error logging", () => {
  it("records only normalized framework context and a sanitized error", () => {
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

    logNextRequestError(
      new Error("database password is hunter2"),
      {
        headers: {
          cookie: "session=private",
          "x-anonresume-upstream-request-id": "gateway-request-1",
          "x-request-id": "123e4567-e89b-42d3-a456-426614174000",
        },
        method: "GET",
        path: "/app/resumes/private-id?token=private",
      },
      {
        renderSource: "server-rendering",
        revalidateReason: undefined,
        routePath: "/app/resumes/[id]",
        routeType: "render",
        routerKind: "App Router",
      },
    );

    expect(lines).toHaveLength(1);
    const serialized = lines[0] ?? "";
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("session=private");
    expect(serialized).not.toContain("token=private");
    expect(serialized).not.toContain("private-id");
    expect(JSON.parse(serialized)).toMatchObject({
      "error.message": "Unexpected application error",
      "error.type": "Error",
      "event.action": "next_request_error",
      "event.dataset": "anonresume.http",
      "event.outcome": "failure",
      "http.request.id": "gateway-request-1",
      "http.request.method": "GET",
      "labels.route_type": "render",
      "labels.router_kind": "App Router",
      "request.id": "123e4567-e89b-42d3-a456-426614174000",
      "url.path": "/app/resumes/[id]",
    });
  });
});
