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
  updateCurrentAccountSessionDevice: vi.fn(),
  verifyAccountPassword: vi.fn(),
  issueAccountEmailChallenge: vi.fn(),
  verifyAccountEmailChallenge: vi.fn(),
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
  updateCurrentAccountSessionDevice: mocks.updateCurrentAccountSessionDevice,
  verifyAccountPassword: mocks.verifyAccountPassword,
}));
vi.mock("@/lib/auth/account/challenges", () => ({
  issueAccountEmailChallenge: mocks.issueAccountEmailChallenge,
  verifyAccountEmailChallenge: mocks.verifyAccountEmailChallenge,
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
import {
  POST as ISSUE_EMAIL_CHALLENGE,
  PUT as VERIFY_CURRENT_EMAIL,
} from "@/app/api/account/email/challenge/route";
import {
  DELETE as REVOKE_SESSION,
  GET as GET_SESSIONS,
  PATCH as UPDATE_SESSION_DEVICE,
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

  it("verifies the password before issuing an unbound current-address challenge", async () => {
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
      }),
    );
    expect(mocks.verifyAccountPassword).toHaveBeenCalledWith({
      userId: "user-1",
      password: "current-password-123",
    });
    expect(mocks.sendAccountVerificationCode).toHaveBeenCalledWith(
      expect.objectContaining({ email: "user@example.com", code: "123456" }),
    );
  });

  it("verifies the current-address code before accepting a new address", async () => {
    const response = await VERIFY_CURRENT_EMAIL(
      request("/api/account/email/challenge", "PUT", { code: "123456" }),
    );

    expect(response.status).toBe(200);
    expect(mocks.verifyAccountEmailChallenge).toHaveBeenCalledWith({
      userId: "user-1",
      purpose: "change_email_old",
      email: "user@example.com",
      code: "123456",
    });
  });

  it("requires a valid current-address code before issuing the new-address challenge", async () => {
    mocks.issueAccountEmailChallenge.mockResolvedValue({
      expiresAt: new Date("2026-10-07T00:10:00.000Z"),
      resendAvailableAt: new Date("2026-10-07T00:01:00.000Z"),
    });

    const response = await ISSUE_EMAIL_CHALLENGE(
      request("/api/account/email/challenge", "POST", {
        stage: "new",
        newEmail: "new@example.com",
        oldEmailCode: "123456",
        locale: "zh-CN",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.verifyAccountEmailChallenge).toHaveBeenCalledWith({
      userId: "user-1",
      purpose: "change_email_old",
      email: "user@example.com",
      code: "123456",
    });
    expect(mocks.issueAccountEmailChallenge).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        purpose: "change_email_new",
        email: "new@example.com",
        binding: "email-change:new@example.com",
      }),
    );
  });

  it("returns readable device details without exposing raw user agents", async () => {
    mocks.listAccountSessions.mockResolvedValue([
      {
        id: "session-1",
        current: true,
        userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro Build/AP1A.240505.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.0.0 Mobile Safari/537.36",
      },
      {
        id: "session-2",
        current: false,
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
      },
      {
        id: "session-3",
        current: false,
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36 Edg/154.0.0.0",
        platform: "macOS",
        platformVersion: "24.6.0",
        deviceModel: null,
      },
    ]);

    const listed = await GET_SESSIONS();
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toEqual({
      sessions: [
        {
          id: "session-1",
          current: true,
          device: {
            type: "mobile",
            vendor: null,
            model: "Pixel 8 Pro",
            os: { name: "Android", version: "14", versionIsMinimum: false },
          },
        },
        {
          id: "session-2",
          current: false,
          device: {
            type: "desktop",
            vendor: null,
            model: null,
            os: { name: "Windows", version: "10", versionIsMinimum: true },
          },
        },
        {
          id: "session-3",
          current: false,
          device: {
            type: "desktop",
            vendor: "Apple",
            model: "Macintosh",
            os: {
              name: "macOS",
              version: "15.6.0",
              versionIsMinimum: false,
            },
          },
        },
      ],
    });
  });

  it("records client-hint device metadata for the current session", async () => {
    const response = await UPDATE_SESSION_DEVICE(
      request("/api/account/sessions", "PATCH", {
        platform: "macOS",
        platformVersion: "26.0.1",
        model: "",
      }),
    );

    expect(response.status).toBe(204);
    expect(mocks.updateCurrentAccountSessionDevice).toHaveBeenCalledWith({
      userId: "user-1",
      sessionId: "session-1",
      platform: "macOS",
      platformVersion: "26.0.1",
      model: null,
    });
  });

  it("records quoted HTTP client hints when JavaScript hints are unavailable", async () => {
    const response = await UPDATE_SESSION_DEVICE(new Request(
      "https://app.example.com/api/account/sessions",
      {
        method: "PATCH",
        headers: {
          origin: "https://app.example.com",
          "content-type": "application/json",
          "sec-ch-ua-platform": '"macOS"',
          "sec-ch-ua-platform-version": '"15.7.1"',
          "sec-ch-ua-model": '""',
        },
        body: "{}",
      },
    ));

    expect(response.status).toBe(204);
    expect(mocks.updateCurrentAccountSessionDevice).toHaveBeenCalledWith({
      userId: "user-1",
      sessionId: "session-1",
      platform: "macOS",
      platformVersion: "15.7.1",
      model: null,
    });
  });

  it("revokes only owned session rows", async () => {
    mocks.listAccountSessions.mockResolvedValue([]);

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
