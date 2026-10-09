const mocks = vi.hoisted(() => ({
  getOptionalSession: vi.fn(),
  getMetadata: vi.fn(),
  verifyIntent: vi.fn(),
  confirm: vi.fn(),
  getStatus: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getOptionalSession: mocks.getOptionalSession,
}));
vi.mock("@/lib/http/request-origin", () => ({ requireSameOrigin: () => null }));
vi.mock("@/lib/auth/account/merge/service", () => ({
  ACCOUNT_MERGE_STATUS_COOKIE: "anonresume_account_merge_status",
  ACCOUNT_MERGE_STATUS_MAX_AGE_SECONDS: 900,
  getAccountMergeIntentMetadata: mocks.getMetadata,
  verifyAccountMergeIntent: mocks.verifyIntent,
  confirmVerifiedAccountMerge: mocks.confirm,
  getAccountMergeOperationStatus: mocks.getStatus,
}));

import { GET as getIntent } from "@/app/api/account/social-merge/intent/route";
import { POST as verifyIntent } from "@/app/api/account/social-merge/verify/route";
import { POST as confirmMerge } from "@/app/api/account/social-merge/confirm/route";
import { GET as getStatus } from "@/app/api/account/social-merge/status/route";

describe("social merge routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOptionalSession.mockResolvedValue({
      user: { id: "current-user" },
      session: { token: "session-token" },
    });
  });

  it("requires an active session and intent cookie", async () => {
    mocks.getOptionalSession.mockResolvedValue(null);
    const response = await getIntent(new Request(
      "http://localhost/api/account/social-merge/intent",
    ) as never);
    expect(response.status).toBe(401);
    expect(mocks.getMetadata).not.toHaveBeenCalled();
  });

  it("rejects malformed verification payloads", async () => {
    const response = await verifyIntent(new Request(
      "http://localhost/api/account/social-merge/verify",
      {
        method: "POST",
        headers: { cookie: "anonresume_account_merge_intent=intent-token" },
        body: JSON.stringify({ targetEmail: "not-an-email" }),
      },
    ) as never);
    expect(response.status).toBe(400);
    expect(mocks.verifyIntent).not.toHaveBeenCalled();
  });

  it("sets an HttpOnly operation-status capability after verification", async () => {
    mocks.verifyIntent.mockResolvedValue({
      rawStatusToken: "status-token",
      confirmNotBefore: new Date("2026-10-09T12:00:05.000Z"),
      allowedPrimaryChoices: ["current", "target"],
    });
    const response = await verifyIntent(new Request(
      "https://resume.example.com/api/account/social-merge/verify",
      {
        method: "POST",
        headers: { cookie: "anonresume_account_merge_intent=intent-token" },
        body: JSON.stringify({
          currentPassword: "current-password",
          targetEmail: "target@example.com",
          targetPassword: "target-password",
          locale: "zh-CN",
        }),
      },
    ) as never);
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(
      "anonresume_account_merge_status=status-token",
    );
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    const body = await response.json();
    expect(body).not.toHaveProperty("rawStatusToken");
  });

  it("confirms only symbolic primary choices", async () => {
    const invalid = await confirmMerge(new Request(
      "http://localhost/api/account/social-merge/confirm",
      {
        method: "POST",
        headers: { cookie: "anonresume_account_merge_status=status-token" },
        body: JSON.stringify({ primaryChoice: "some-user-id" }),
      },
    ) as never);
    expect(invalid.status).toBe(400);

    mocks.confirm.mockResolvedValue({ state: "confirmed" });
    const valid = await confirmMerge(new Request(
      "http://localhost/api/account/social-merge/confirm",
      {
        method: "POST",
        headers: { cookie: "anonresume_account_merge_status=status-token" },
        body: JSON.stringify({ primaryChoice: "target" }),
      },
    ) as never);
    expect(valid.status).toBe(200);
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({
      primaryChoice: "target",
      rawStatusToken: "status-token",
      userId: "current-user",
    }));
  });

  it("reads limited status without requiring a surviving session", async () => {
    mocks.getStatus.mockResolvedValue({ state: "completed", failureCode: null });
    const response = await getStatus(new Request(
      "http://localhost/api/account/social-merge/status",
      { headers: { cookie: "anonresume_account_merge_status=status-token" } },
    ) as never);
    await expect(response.json()).resolves.toEqual({
      state: "completed",
      failureCode: null,
    });
    expect(mocks.getOptionalSession).not.toHaveBeenCalled();
  });
});
