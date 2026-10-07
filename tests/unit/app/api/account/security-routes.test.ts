import { vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOptionalSession: vi.fn(),
  getAccountProfile: vi.fn(),
  updateAccountProfile: vi.fn(),
  changeAccountPassword: vi.fn(),
  changeAccountEmail: vi.fn(),
  listAccountSessions: vi.fn(),
  revokeAccountSession: vi.fn(),
  revokeOtherAccountSessions: vi.fn(),
  verifyAccountPassword: vi.fn(),
  issueAccountEmailChallenge: vi.fn(),
  sendAccountSecurityNotice: vi.fn(),
  sendAccountVerificationCode: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getOptionalSession: mocks.getOptionalSession,
}));
vi.mock("@/lib/auth/account/security", () => ({
  getAccountProfile: mocks.getAccountProfile,
  updateAccountProfile: mocks.updateAccountProfile,
  changeAccountPassword: mocks.changeAccountPassword,
  changeAccountEmail: mocks.changeAccountEmail,
  listAccountSessions: mocks.listAccountSessions,
  revokeAccountSession: mocks.revokeAccountSession,
  revokeOtherAccountSessions: mocks.revokeOtherAccountSessions,
  verifyAccountPassword: mocks.verifyAccountPassword,
}));
vi.mock("@/lib/auth/account/challenges", () => ({
  issueAccountEmailChallenge: mocks.issueAccountEmailChallenge,
}));
vi.mock("@/lib/runtime/email", () => ({
  sendAccountSecurityNotice: mocks.sendAccountSecurityNotice,
  sendAccountVerificationCode: mocks.sendAccountVerificationCode,
}));

import {
  GET as GET_PROFILE,
  PATCH as PATCH_PROFILE,
} from "@/app/api/account/profile/route";
import { POST as CHANGE_PASSWORD } from "@/app/api/account/password/route";
import { POST as ISSUE_EMAIL_CHALLENGE } from "@/app/api/account/email/challenge/route";
import {
  DELETE as REVOKE_SESSION,
  GET as GET_SESSIONS,
  POST as REVOKE_OTHER_SESSIONS,
} from "@/app/api/account/sessions/route";
import { AccountSecurityError } from "@/lib/auth/account/errors";

const session = {
  user: {
    id: "user-1",
    name: "User",
    email: "user@example.com",
  },
  session: {
    id: "session-1",
    token: "token-1",
  },
};

function request(
  path: string,
  method: string,
  body?: unknown,
  origin = "https://app.example.com",
) {
  return new Request(`https://app.example.com${path}`, {
    method,
    headers: {
      origin,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("account security routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOptionalSession.mockResolvedValue(session);
  });

  it("returns the account profile without exposing credential data", async () => {
    mocks.getAccountProfile.mockResolvedValue({
      name: "User",
      email: "user@example.com",
      emailVerified: true,
      hasPassword: true,
    });

    const response = await GET_PROFILE();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      profile: {
        name: "User",
        email: "user@example.com",
        emailVerified: true,
        hasPassword: true,
      },
    });
  });

  it("rejects cross-origin profile writes before calling the service", async () => {
    const response = await PATCH_PROFILE(
      request(
        "/api/account/profile",
        "PATCH",
        { name: "Changed" },
        "https://evil.example.com",
      ),
    );

    expect(response.status).toBe(403);
    expect(mocks.updateAccountProfile).not.toHaveBeenCalled();
  });

  it("returns a stable password error code", async () => {
    mocks.changeAccountPassword.mockRejectedValue(
      new AccountSecurityError("password_incorrect"),
    );

    const response = await CHANGE_PASSWORD(
      request("/api/account/password", "POST", {
        currentPassword: "wrong-password",
        newPassword: "replacement-password-456",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "password_incorrect",
    });
  });

  it("does not allow an unauthenticated password change", async () => {
    mocks.getOptionalSession.mockResolvedValue(null);

    const response = await CHANGE_PASSWORD(
      request("/api/account/password", "POST", {
        currentPassword: "current-password-123",
        newPassword: "replacement-password-456",
      }),
    );

    expect(response.status).toBe(401);
    expect(mocks.changeAccountPassword).not.toHaveBeenCalled();
  });

  it("binds an old-address challenge to the signed-in email", async () => {
    mocks.issueAccountEmailChallenge.mockImplementation(
      async ({ deliver }: { deliver: (input: { code: string }) => Promise<void> }) => {
        await deliver({ code: "123456" });
        return {
          expiresAt: new Date("2026-10-07T00:10:00.000Z"),
          resendAvailableAt: new Date("2026-10-07T00:01:00.000Z"),
        };
      },
    );

    const response = await ISSUE_EMAIL_CHALLENGE(
      request("/api/account/email/challenge", "POST", {
        stage: "old",
        newEmail: "new@example.com",
        currentPassword: "current-password-123",
        locale: "zh-CN",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.issueAccountEmailChallenge).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        purpose: "change_email_old",
        email: "user@example.com",
        binding: "email-change:new@example.com",
      }),
    );
    expect(mocks.sendAccountVerificationCode).toHaveBeenCalledWith(
      expect.objectContaining({ email: "user@example.com", code: "123456" }),
    );
  });

  it("lists sessions without returning tokens and revokes only owned rows", async () => {
    mocks.listAccountSessions.mockResolvedValue([
      { id: "session-1", current: true, userAgent: "Browser" },
    ]);

    const listed = await GET_SESSIONS();
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toEqual({
      sessions: [{ id: "session-1", current: true, userAgent: "Browser" }],
    });

    const revoked = await REVOKE_SESSION(
      request("/api/account/sessions", "DELETE", {
        sessionId: "session-2",
      }),
    );
    expect(revoked.status).toBe(200);
    expect(mocks.revokeAccountSession).toHaveBeenCalledWith({
      userId: "user-1",
      currentSessionId: "session-1",
      sessionId: "session-2",
    });

    const revokedOthers = await REVOKE_OTHER_SESSIONS(
      request("/api/account/sessions", "POST"),
    );
    expect(revokedOthers.status).toBe(200);
    expect(mocks.revokeOtherAccountSessions).toHaveBeenCalledWith({
      userId: "user-1",
      currentSessionToken: "token-1",
    });
  });
});
