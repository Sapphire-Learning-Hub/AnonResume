import { vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOptionalIdentitySession: vi.fn(),
  getOptionalSession: vi.fn(),
  getAccountLifecycle: vi.fn(),
  isManagementOnlyIdentity: vi.fn(),
  verifyAccountPassword: vi.fn(),
  issueAccountEmailChallenge: vi.fn(),
  submitAccountDeletion: vi.fn(),
  restoreAccountDeletion: vi.fn(),
  sendAccountSecurityNotice: vi.fn(),
  sendAccountVerificationCode: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getOptionalIdentitySession: mocks.getOptionalIdentitySession,
  getOptionalSession: mocks.getOptionalSession,
}));
vi.mock("@/lib/admin/store", () => ({
  isManagementOnlyIdentity: mocks.isManagementOnlyIdentity,
}));
vi.mock("@/lib/auth/account/repository", () => ({
  getAccountLifecycle: mocks.getAccountLifecycle,
}));
vi.mock("@/lib/auth/account/security", () => ({
  verifyAccountPassword: mocks.verifyAccountPassword,
}));
vi.mock("@/lib/auth/account/challenges", () => ({
  issueAccountEmailChallenge: mocks.issueAccountEmailChallenge,
}));
vi.mock("@/lib/auth/account/deletion", () => ({
  submitAccountDeletion: mocks.submitAccountDeletion,
  restoreAccountDeletion: mocks.restoreAccountDeletion,
}));
vi.mock("@/lib/runtime/email", () => ({
  sendAccountSecurityNotice: mocks.sendAccountSecurityNotice,
  sendAccountVerificationCode: mocks.sendAccountVerificationCode,
}));

import {
  GET as GET_DELETION,
  POST as SUBMIT_DELETION,
} from "@/app/api/account/deletion/route";
import { POST as ISSUE_CHALLENGE } from "@/app/api/account/deletion/challenge/route";
import { POST as RECOVER_ACCOUNT } from "@/app/api/account/deletion/recover/route";

const identity = {
  user: { id: "user-1", email: "user@example.com", name: "User" },
  session: { id: "session-1", token: "token-1" },
};

function request(path: string, body?: unknown) {
  return new Request(`https://app.example.com${path}`, {
    method: "POST",
    headers: {
      origin: "https://app.example.com",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("account deletion routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOptionalIdentitySession.mockResolvedValue(identity);
    mocks.getOptionalSession.mockResolvedValue(identity);
    mocks.isManagementOnlyIdentity.mockResolvedValue(false);
    mocks.getAccountLifecycle.mockResolvedValue({
      status: "pending_deletion",
      deletionRequestedAt: new Date("2026-10-07T00:00:00.000Z"),
      deletionDueAt: new Date("2026-10-14T00:00:00.000Z"),
      deletedAt: null,
    });
    mocks.issueAccountEmailChallenge.mockResolvedValue({
      expiresAt: new Date("2026-10-07T00:10:00.000Z"),
      resendAvailableAt: new Date("2026-10-07T00:01:00.000Z"),
    });
  });

  it("returns the pending lifecycle for the restricted recovery page", async () => {
    const response = await GET_DELETION();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      lifecycle: expect.objectContaining({ status: "pending_deletion" }),
    });
  });

  it("issues a recovery code for a pending identity after password verification", async () => {
    const response = await ISSUE_CHALLENGE(
      request("/api/account/deletion/challenge", {
        purpose: "restore",
        password: "current-password-123",
        locale: "en-US",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.verifyAccountPassword).toHaveBeenCalledWith({
      userId: "user-1",
      password: "current-password-123",
      allowPendingDeletion: true,
    });
    expect(mocks.issueAccountEmailChallenge).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: "restore_account",
        email: "user@example.com",
      }),
    );
  });

  it("submits deletion with the current session and sends a security notice", async () => {
    mocks.submitAccountDeletion.mockImplementation(
      async ({ notify }: { notify: (value: { email: string; name: string; deletionDueAt: Date }) => Promise<void> }) => {
        const deletionDueAt = new Date("2026-10-14T00:00:00.000Z");
        await notify({
          email: "user@example.com",
          name: "User",
          deletionDueAt,
        });
        return { deletionDueAt };
      },
    );

    const response = await SUBMIT_DELETION(
      request("/api/account/deletion", {
        password: "current-password-123",
        code: "123456",
        locale: "zh-CN",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.submitAccountDeletion).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        currentSessionToken: "token-1",
      }),
    );
    expect(mocks.sendAccountSecurityNotice).toHaveBeenCalledWith(
      expect.objectContaining({ event: "deletion_requested" }),
    );
  });

  it("recovers a pending account without requiring an active product session", async () => {
    mocks.getOptionalSession.mockResolvedValue(null);

    const response = await RECOVER_ACCOUNT(
      request("/api/account/deletion/recover", {
        password: "current-password-123",
        code: "123456",
        locale: "zh-CN",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.restoreAccountDeletion).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        currentSessionToken: "token-1",
      }),
    );
  });
});
