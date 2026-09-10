import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  getOwn: vi.fn(),
  getSession: vi.fn(),
  list: vi.fn(),
  requireAdmin: vi.fn(),
  review: vi.fn(),
  submit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getOptionalIdentitySession: mocks.getSession,
}));

vi.mock("@/lib/admin/api", () => ({
  adminApiErrorResponse: () => null,
  requireAdminApi: mocks.requireAdmin,
}));

vi.mock("@/lib/admin/mfa-reset-requests", () => ({
  AdminMfaResetRequestConflictError: class extends Error {},
  AdminMfaResetRequestForbiddenError: class extends Error {},
  AdminMfaResetRequestNotFoundError: class extends Error {},
  cancelAdminMfaResetRequest: mocks.cancel,
  getAdminMfaResetRequestForUser: mocks.getOwn,
  listAdminMfaResetRequests: mocks.list,
  reviewAdminMfaResetRequest: mocks.review,
  submitAdminMfaResetRequest: mocks.submit,
}));

import {
  DELETE as cancelRequest,
  GET as getRequest,
  POST as submitRequest,
} from "@/app/api/account/management-mfa-reset/route";
import { PATCH as reviewRequest } from "@/app/api/manage/mfa-reset-requests/[id]/route";

describe("management MFA reset request routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      session: { id: "base-session" },
      user: { id: "delegated", email: "delegated@example.com" },
    });
    mocks.getOwn.mockResolvedValue(null);
    mocks.submit.mockResolvedValue({ id: "request-1", status: "pending" });
    mocks.requireAdmin.mockResolvedValue({ userId: "super-admin" });
    mocks.review.mockResolvedValue({ id: "request-1", status: "approved" });
  });

  it("uses the product identity session for self-service request access", async () => {
    const getResponse = await getRequest();
    expect(getResponse.status).toBe(200);
    expect(mocks.getOwn).toHaveBeenCalledWith("delegated");

    const postResponse = await submitRequest(
      new Request("http://localhost/api/account/management-mfa-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reason: "My authenticator and recovery codes are unavailable.",
        }),
      }),
    );
    expect(postResponse.status).toBe(201);
    expect(mocks.submit).toHaveBeenCalledWith({
      reason: "My authenticator and recovery codes are unavailable.",
      userId: "delegated",
    });
  });

  it("allows a requester to cancel only their own request", async () => {
    const response = await cancelRequest(
      new Request("http://localhost/api/account/management-mfa-reset", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId: "5b67ea55-1fe3-4f7d-9a0c-f1271144071f" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.cancel).toHaveBeenCalledWith({
      requestId: "5b67ea55-1fe3-4f7d-9a0c-f1271144071f",
      userId: "delegated",
    });
  });

  it("rejects self-service access without a product identity session", async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await getRequest();

    expect(response.status).toBe(401);
    expect(mocks.getOwn).not.toHaveBeenCalled();
  });

  it("requires recent super-admin verification before review", async () => {
    const response = await reviewRequest(
      new Request("http://localhost/api/manage/mfa-reset-requests/request-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "approved" }),
      }),
      { params: Promise.resolve({ id: "request-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.requireAdmin).toHaveBeenCalledWith({
      recentMfa: true,
      superAdminOnly: true,
    });
    expect(mocks.review).toHaveBeenCalledWith({
      actorUserId: "super-admin",
      decision: "approved",
      reason: undefined,
      requestId: "request-1",
    });
  });
});
