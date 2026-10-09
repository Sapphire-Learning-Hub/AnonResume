import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  decision: vi.fn(),
  handlerGet: vi.fn(),
  handlerPost: vi.fn(),
  getAuth: vi.fn(),
  isPasswordResetAllowedForToken: vi.fn(),
}));

vi.mock("@/lib/admin/setup/access", () => ({
  getSetupAccessDecision: mocks.decision,
}));

vi.mock("@/lib/auth/config", () => ({
  getAuth: mocks.getAuth,
}));
vi.mock("@/lib/auth/account/security", () => ({
  isPasswordResetAllowedForToken: mocks.isPasswordResetAllowedForToken,
}));

vi.mock("better-auth/next-js", () => ({
  toNextJsHandler: () => ({
    GET: mocks.handlerGet,
    POST: mocks.handlerPost,
  }),
}));

import { GET, POST } from "@/app/api/auth/[...all]/route";

describe("authentication setup gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuth.mockResolvedValue({});
    mocks.handlerGet.mockResolvedValue(new Response(null, { status: 204 }));
    mocks.handlerPost.mockResolvedValue(new Response(null, { status: 204 }));
    mocks.isPasswordResetAllowedForToken.mockResolvedValue(true);
  });

  it("rejects a previously issued reset token after deletion becomes pending", async () => {
    mocks.decision.mockResolvedValue("allowed");
    mocks.isPasswordResetAllowedForToken.mockResolvedValue(false);

    const response = await POST(
      new Request("http://localhost/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: "issued-before-deletion",
          newPassword: "replacement-password-456",
        }),
      }) as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "INVALID_TOKEN",
      message: "Invalid token",
    });
    expect(mocks.handlerPost).not.toHaveBeenCalled();
  });

  it("blocks auth mutations while initial setup is pending", async () => {
    mocks.decision.mockResolvedValue("require_setup");

    const response = await POST(
      new Request("http://localhost/api/auth/sign-up/email", { method: "POST" }) as never,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "instance_setup_required",
    });
    expect(mocks.handlerPost).not.toHaveBeenCalled();
  });

  it("rejects email registration without explicit legal consent", async () => {
    mocks.decision.mockResolvedValue("allowed");

    const response = await POST(
      new Request("http://localhost/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "user@example.com",
          name: "User",
          password: "strong-password",
        }),
      }) as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "REGISTRATION_CONSENT_REQUIRED",
      message: "Privacy policy and terms consent is required",
    });
    expect(mocks.handlerPost).not.toHaveBeenCalled();
  });

  it("rejects explicit social registration without legal consent", async () => {
    mocks.decision.mockResolvedValue("allowed");

    const response = await POST(
      new Request("http://localhost/api/auth/sign-in/social", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "github", requestSignUp: true }),
      }) as never,
    );

    expect(response.status).toBe(400);
    expect(mocks.handlerPost).not.toHaveBeenCalled();
  });

  it("forwards registration after legal consent", async () => {
    mocks.decision.mockResolvedValue("allowed");

    await expect(POST(
      new Request("http://localhost/api/auth/sign-up/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-anonresume-registration-consent": "true",
        },
        body: JSON.stringify({
          email: "user@example.com",
          name: "User",
          password: "strong-password",
        }),
      }) as never,
    )).resolves.toMatchObject({ status: 204 });

    expect(mocks.handlerPost).toHaveBeenCalledOnce();
  });

  it("blocks auth callbacks while initial setup is pending", async () => {
    mocks.decision.mockResolvedValue("require_setup");

    const response = await GET(
      new Request("http://localhost/api/auth/callback/github") as never,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "instance_setup_required",
    });
    expect(mocks.handlerGet).not.toHaveBeenCalled();
  });

  it("preserves auth reads and recovery-mode mutations", async () => {
    mocks.decision.mockResolvedValue("management_recovery");

    await expect(
      GET(new Request("http://localhost/api/auth/get-session") as never),
    ).resolves.toMatchObject({ status: 204 });
    await expect(
      POST(
        new Request("http://localhost/api/auth/sign-in/email", { method: "POST" }) as never,
      ),
    ).resolves.toMatchObject({ status: 204 });

    expect(mocks.handlerGet).toHaveBeenCalledOnce();
    expect(mocks.handlerPost).toHaveBeenCalledOnce();
  });
});
