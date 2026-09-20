import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  begin: vi.fn(),
  complete: vi.fn(),
  requireSession: vi.fn(),
}));

vi.mock("@/lib/admin/setup/completion", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("@/lib/admin/setup/completion")
  >();
  return {
    ...original,
    beginInstanceSetupAccount: mocks.begin,
    completeInstanceSetup: mocks.complete,
  };
});

vi.mock("@/lib/admin/setup/session", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("@/lib/admin/setup/session")
  >();
  return {
    ...original,
    requireInstanceSetupSession: mocks.requireSession,
  };
});

import { POST as accountRoute } from "@/app/api/setup/account/route";
import { POST as completeRoute } from "@/app/api/setup/complete/route";
import {
  SetupAlreadyCompletedError,
  SetupDuplicateEmailError,
  SetupInvalidPasswordError,
} from "@/lib/admin/setup/completion";
import { SetupSessionInvalidError } from "@/lib/admin/setup/session";
import {
  AdminMfaLockedError,
  AdminMfaVerificationError,
} from "@/lib/admin/store";

const setupSession = {
  sessionId: "75307c75-23ba-4308-9796-e953d93e38f5",
  generation: "bd4f0f99-25c6-48e4-8886-aad342a50dba",
  expiresAt: new Date("2026-09-21T00:30:00.000Z"),
  mode: "initialization" as const,
  targetUserId: null,
};

describe("setup completion routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue(setupSession);
    mocks.begin.mockResolvedValue({
      email: "owner@example.com",
      deviceId: "4db73a13-640f-4385-8a29-b9fe053c28cb",
      secret: "TOTPSECRET",
      uri: "otpauth://totp/AnonResume:owner%40example.com",
    });
    mocks.complete.mockResolvedValue({
      email: "owner@example.com",
      recoveryCodes: ["AAAA-BBBB-CCCC-DDDD-EEEE"],
    });
  });

  it("starts account setup through the claimed session", async () => {
    const response = await accountRoute(
      request("/api/setup/account", {
        name: "Owner",
        email: "owner@example.com",
        password: "long-secure-password",
        deviceName: "Primary authenticator",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.begin).toHaveBeenCalledWith({
      session: setupSession,
      name: "Owner",
      email: "owner@example.com",
      password: "long-secure-password",
      deviceName: "Primary authenticator",
    });
  });

  it("completes setup and returns recovery codes", async () => {
    const response = await completeRoute(
      request("/api/setup/complete", {
        deviceId: "4db73a13-640f-4385-8a29-b9fe053c28cb",
        code: "123456",
        password: "long-secure-password",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      email: "owner@example.com",
      recoveryCodes: ["AAAA-BBBB-CCCC-DDDD-EEEE"],
    });
  });

  it.each([
    [new SetupSessionInvalidError(), 401, "setup_session_invalid"],
    [new SetupDuplicateEmailError(), 409, "setup_email_conflict"],
    [new SetupInvalidPasswordError(), 400, "setup_password_invalid"],
    [new SetupAlreadyCompletedError(), 409, "setup_already_completed"],
    [new AdminMfaVerificationError(), 400, "setup_mfa_invalid"],
    [
      new AdminMfaLockedError(new Date("2026-09-21T00:05:00.000Z")),
      423,
      "setup_mfa_locked",
    ],
  ])("maps %s to a stable API error", async (error, status, code) => {
    mocks.complete.mockRejectedValueOnce(error);

    const response = await completeRoute(
      request("/api/setup/complete", {
        deviceId: "4db73a13-640f-4385-8a29-b9fe053c28cb",
        code: "123456",
        password: "long-secure-password",
      }),
    );

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ error: code });
  });

  it("rejects invalid account fields before service execution", async () => {
    const response = await accountRoute(
      request("/api/setup/account", {
        name: "",
        email: "not-an-email",
        password: "short",
        deviceName: "",
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.begin).not.toHaveBeenCalled();
  });
});

function request(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
    },
    body: JSON.stringify(body),
  });
}
