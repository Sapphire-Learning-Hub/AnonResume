import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  history: vi.fn(),
  patch: vi.fn(),
  publish: vi.fn(),
  requireAdmin: vi.fn(),
  rollback: vi.fn(),
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

vi.mock("@/lib/config/admin/service", () => ({
  getManagedConfiguration: mocks.get,
  listConfigurationHistory: mocks.history,
  patchConfigurationDraft: mocks.patch,
  prepareConfigurationRollback: mocks.rollback,
  publishManagedConfiguration: mocks.publish,
}));

import { GET, PATCH } from "@/app/api/manage/configuration/route";
import { GET as getHistory } from "@/app/api/manage/configuration/history/route";
import { POST as publish } from "@/app/api/manage/configuration/publish/route";
import { POST as rollback } from "@/app/api/manage/configuration/revisions/[id]/rollback/route";
import { configurationApiErrorResponse } from "@/lib/config/admin/api";
import { ConfigurationValidationError } from "@/lib/config/admin/validation";
import {
  ConfigurationRevisionConflictError,
  ConfigurationStateError,
} from "@/lib/config/store";

const draftRevisionId = "4e86d4f7-f985-4bd1-9e87-a82dfe7acaeb";
const sourceRevisionId = "c857abfc-2ed9-44ae-a0d6-9f59b49b9ef1";
const view = {
  activeRevision: { id: sourceRevisionId, version: 1 },
  draftRevision: {
    baseVersion: 1,
    id: draftRevisionId,
    updatedAt: "2026-09-20T00:00:00.000Z",
  },
  fields: [],
  pendingRestartConsumers: [],
};

function mutationRequest(url: string, body?: unknown) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("configuration management routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ userId: "admin-1" });
    mocks.get.mockResolvedValue(view);
    mocks.patch.mockResolvedValue(view);
    mocks.publish.mockResolvedValue(view);
    mocks.history.mockResolvedValue([]);
    mocks.rollback.mockResolvedValue(view);
  });

  it("requires the matching permission for each read operation", async () => {
    expect((await GET()).status).toBe(200);
    expect(mocks.requireAdmin).toHaveBeenLastCalledWith({
      permission: "configuration.read",
    });

    expect((await getHistory()).status).toBe(200);
    expect(mocks.requireAdmin).toHaveBeenLastCalledWith({
      permission: "configuration.history",
    });
  });

  it("patches through the authenticated actor and edit permission", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/manage/configuration", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
        },
        body: JSON.stringify({
          baseVersion: 1,
          draftRevisionId,
          changes: [
            {
              key: "resumeVersionHistoryLimit",
              operation: "set",
              value: 8,
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.requireAdmin).toHaveBeenCalledWith({
      permission: "configuration.edit",
    });
    expect(mocks.patch).toHaveBeenCalledWith({
      actorUserId: "admin-1",
      baseVersion: 1,
      draftRevisionId,
      changes: [
        {
          key: "resumeVersionHistoryLimit",
          operation: "set",
          value: 8,
        },
      ],
    });
  });

  it("requires recent MFA for publication and rollback", async () => {
    const publishResponse = await publish(
      mutationRequest("http://localhost/api/manage/configuration/publish", {
        baseVersion: 1,
        draftRevisionId,
      }),
    );
    expect(publishResponse.status).toBe(200);
    expect(mocks.requireAdmin).toHaveBeenLastCalledWith({
      permission: "configuration.publish",
      recentMfa: true,
    });
    expect(mocks.publish).toHaveBeenCalledWith({
      actorUserId: "admin-1",
      baseVersion: 1,
      draftRevisionId,
    });

    const rollbackResponse = await rollback(
      mutationRequest(
        `http://localhost/api/manage/configuration/revisions/${sourceRevisionId}/rollback`,
      ),
      { params: Promise.resolve({ id: sourceRevisionId }) },
    );
    expect(rollbackResponse.status).toBe(200);
    expect(mocks.requireAdmin).toHaveBeenLastCalledWith({
      permission: "configuration.rollback",
      recentMfa: true,
    });
    expect(mocks.rollback).toHaveBeenCalledWith({
      actorUserId: "admin-1",
      sourceRevisionId,
    });
  });

  it("preserves the existing recent-MFA response", async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new Error("mfa_required"));

    const response = await publish(
      mutationRequest("http://localhost/api/manage/configuration/publish", {
        baseVersion: 1,
        draftRevisionId,
      }),
    );

    expect(response.status).toBe(428);
    await expect(response.json()).resolves.toEqual({
      error: "mfa_reauthentication_required",
    });
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("maps validation, conflict, and missing revisions to stable errors", async () => {
    const invalid = configurationApiErrorResponse(
      new ConfigurationValidationError([]),
    );
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({
      error: "configuration_invalid",
    });

    const conflict = configurationApiErrorResponse(
      new ConfigurationRevisionConflictError(),
    );
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toEqual({
      error: "configuration_conflict",
    });

    const missing = configurationApiErrorResponse(
      new ConfigurationStateError("configuration_revision_not_found"),
    );
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toEqual({
      error: "configuration_not_found",
    });
  });

  it("rejects invalid fields before calling the service", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/manage/configuration", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
        },
        body: JSON.stringify({
          baseVersion: 1,
          draftRevisionId,
          changes: [{ key: "databaseUrl", operation: "set", value: "secret" }],
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.patch).not.toHaveBeenCalled();
  });
});
