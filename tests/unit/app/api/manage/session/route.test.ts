import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  beginEnrollment: vi.fn(),
  cookieSet: vi.fn(),
  createSession: vi.fn(),
  getAccess: vi.fn(),
  getIdentity: vi.fn(),
  hasMfaDevice: vi.fn(),
  verifyEnrollment: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: mocks.cookieSet }),
}));

vi.mock("@/lib/auth/session", () => ({
  getOptionalIdentitySession: mocks.getIdentity,
}));

vi.mock("@/lib/admin/store", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/admin/store")>();
  return {
    ...original,
    beginAdminMfaEnrollment: mocks.beginEnrollment,
    createAdminSession: mocks.createSession,
    getAdminAccessForUser: mocks.getAccess,
    hasVerifiedAdminMfaDevice: mocks.hasMfaDevice,
    verifyAdminMfaEnrollment: mocks.verifyEnrollment,
  };
});

import { POST } from "@/app/api/manage/session/route";

function request(body: unknown) {
  return new Request("http://localhost/api/manage/session", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

describe("management session route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getIdentity.mockResolvedValue({
      session: { id: "base-session" },
      user: { id: "user-admin", email: "user@example.com" },
    });
    mocks.getAccess.mockResolvedValue({ kind: "delegated_admin" });
    mocks.hasMfaDevice.mockResolvedValue(false);
  });

  it("starts first-time MFA enrollment for an assigned administrator", async () => {
    mocks.beginEnrollment.mockResolvedValue({
      deviceId: "f43b4e14-6cb5-4c57-af07-ae421f868fb9",
      secret: "FIRSTDEVICESECRET",
      uri: "otpauth://totp/AnonResume:user%40example.com",
    });

    const response = await POST(
      request({ action: "begin_enrollment", deviceName: "主验证器" }),
    );

    expect(response.status).toBe(200);
    expect(mocks.beginEnrollment).toHaveBeenCalledWith({
      email: "user@example.com",
      name: "主验证器",
      requireNoVerifiedDevices: true,
      userId: "user-admin",
    });
  });

  it("binds the first device and creates the isolated management session", async () => {
    mocks.verifyEnrollment.mockResolvedValue([
      "AAAA-BBBB-CCCC-DDDD-EEEE",
    ]);
    mocks.createSession.mockResolvedValue({ rawToken: "management-token" });

    const response = await POST(
      request({
        action: "complete_enrollment",
        code: "123456",
        deviceId: "f43b4e14-6cb5-4c57-af07-ae421f868fb9",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      recoveryCodes: ["AAAA-BBBB-CCCC-DDDD-EEEE"],
    });
    expect(mocks.verifyEnrollment).toHaveBeenCalledWith({
      deviceId: "f43b4e14-6cb5-4c57-af07-ae421f868fb9",
      requireNoVerifiedDevices: true,
      token: "123456",
      userId: "user-admin",
    });
    expect(mocks.createSession).toHaveBeenCalledWith({
      baseSessionId: "base-session",
      mfaDeviceId: "f43b4e14-6cb5-4c57-af07-ae421f868fb9",
      userId: "user-admin",
    });
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      expect.any(String),
      "management-token",
      expect.any(Object),
    );
  });

  it("refuses enrollment when a verified device already exists", async () => {
    mocks.hasMfaDevice.mockResolvedValue(true);

    const response = await POST(
      request({ action: "begin_enrollment", deviceName: "主验证器" }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "mfa_already_configured",
    });
    expect(mocks.beginEnrollment).not.toHaveBeenCalled();
  });
});
