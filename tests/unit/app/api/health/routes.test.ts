import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkApplicationReadiness: vi.fn(),
}));

vi.mock("@/lib/runtime/health", () => ({
  checkApplicationReadiness: mocks.checkApplicationReadiness,
}));

import { GET as GET_LIVE } from "@/app/api/health/live/route";
import { GET as GET_READY } from "@/app/api/health/ready/route";
import { initializeHttpLogCapture } from "../../../../support/observability";

describe("health routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("correlates a successful probe without emitting an access event", async () => {
    const logs = initializeHttpLogCapture();

    const response = await GET_LIVE();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toEqual(expect.any(String));
    await expect(response.json()).resolves.toEqual({ status: "alive" });
    expect(logs.events()).toHaveLength(0);
  });

  it("keeps readiness failures visible", async () => {
    const logs = initializeHttpLogCapture();
    mocks.checkApplicationReadiness.mockResolvedValue({
      ready: false,
      reason: "database_unavailable",
      setupRequired: false,
    });

    const response = await GET_READY();

    expect(response.status).toBe(503);
    expect(response.headers.get("x-request-id")).toEqual(expect.any(String));
    expect(logs.events()).toHaveLength(1);
    expect(logs.events()[0]).toMatchObject({
      "event.action": "http_request_completed",
      "event.outcome": "failure",
      "http.response.status_code": 503,
      "url.path": "/api/health/ready",
    });
  });
});
