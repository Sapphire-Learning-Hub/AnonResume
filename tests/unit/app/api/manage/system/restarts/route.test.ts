import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  getCurrent: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/admin/api", async () => {
  const { NextResponse } = await import("next/server");
  return {
    adminApiErrorResponse(error: unknown) {
      return error instanceof Error && error.message === "mfa_required"
        ? NextResponse.json(
            { error: "mfa_reauthentication_required" },
            { status: 428 },
          )
        : null;
    },
    requireAdminApi: mocks.requireAdmin,
  };
});

vi.mock("@/lib/admin/system-restart/service", () => ({
  createSystemRestartOperation: mocks.create,
  getCurrentSystemRestartOperation: mocks.getCurrent,
}));

vi.mock("@/lib/runtime/instance-identity", () => ({
  resolveRuntimeIdentity: () => ({ deploymentId: "production" }),
}));

import { POST } from "@/app/api/manage/system/restarts/route";
import { GET } from "@/app/api/manage/system/restarts/current/route";
import { systemRestartApiErrorResponse } from "@/lib/admin/system-restart/api";
import { SystemRestartOperationError } from "@/lib/admin/system-restart/errors";
import { RequestBodyTooLargeError } from "@/lib/http/request-body";

const idempotencyKey = "c857abfc-2ed9-44ae-a0d6-9f59b49b9ef1";
const operation = {
  actorUserId: "admin-1",
  completedAt: null,
  createdAt: "2026-10-13T08:00:00.000Z",
  deploymentId: "production",
  desiredRevisionId: "4e86d4f7-f985-4bd1-9e87-a82dfe7acaeb",
  errorCode: null,
  id: "44f65188-e649-4f17-81cc-e0e1fd996be4",
  startedAt: null,
  status: "queued",
  targets: [],
  updatedAt: "2026-10-13T08:00:00.000Z",
};

function request(
  body: unknown = { idempotencyKey },
  origin = "http://localhost",
) {
  return new Request("http://localhost/api/manage/system/restarts", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", origin },
    method: "POST",
  });
}

describe("managed system restart routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ userId: "admin-1" });
    mocks.create.mockResolvedValue(operation);
    mocks.getCurrent.mockResolvedValue(operation);
  });

  it("requires system read permission for current progress", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.requireAdmin).toHaveBeenCalledWith({
      permission: "system.read",
    });
    expect(mocks.getCurrent).toHaveBeenCalledWith({
      deploymentId: "production",
    });
    await expect(response.json()).resolves.toEqual(operation);
  });

  it("requires restart permission and recent MFA and propagates the actor", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.requireAdmin).toHaveBeenCalledWith({
      permission: "system.restart",
      recentMfa: true,
    });
    expect(mocks.create).toHaveBeenCalledWith({
      actorUserId: "admin-1",
      deploymentId: "production",
      idempotencyKey,
    });
  });

  it("returns the same operation for an idempotent replay", async () => {
    const first = await POST(request());
    const replay = await POST(request());

    await expect(first.json()).resolves.toEqual(operation);
    await expect(replay.json()).resolves.toEqual(operation);
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });

  it("rejects cross-origin, oversized, malformed, and non-strict input", async () => {
    expect((await POST(request(undefined, "https://evil.example"))).status).toBe(403);

    const oversized = request();
    oversized.headers.set("content-length", String(65 * 1024));
    expect((await POST(oversized)).status).toBe(400);
    expect((await POST(request({ idempotencyKey, extra: true }))).status).toBe(400);
    expect((await POST(request({ idempotencyKey: "not-a-uuid" }))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("preserves recent MFA responses", async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new Error("mfa_required"));

    const response = await POST(request());

    expect(response.status).toBe(428);
    await expect(response.json()).resolves.toEqual({
      error: "mfa_reauthentication_required",
    });
  });

  it("maps known restart failures without exposing raw errors", async () => {
    for (const code of [
      "no_pending_restart",
      "operation_active",
      "restart_unsupported",
      "runtime_stale",
      "runtime_unhealthy",
    ] as const) {
      const response = systemRestartApiErrorResponse(
        new SystemRestartOperationError(code),
      );
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({ error: code });
    }

    const unavailable = systemRestartApiErrorResponse(
      new SystemRestartOperationError("configuration_unavailable"),
    );
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({
      error: "configuration_unavailable",
    });

    const invalid = systemRestartApiErrorResponse(
      new RequestBodyTooLargeError(),
    );
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({
      error: "system_restart_invalid",
    });
  });
});
