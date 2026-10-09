import { NextRequest } from "next/server";

import { SocialRegistrationError } from "@/lib/auth/social-registration/errors";

const mocks = vi.hoisted(() => ({
  cancelAttempt: vi.fn(),
  createAttempt: vi.fn(),
  findConflict: vi.fn(),
  getOptionalSession: vi.fn(),
  getSetupDecision: vi.fn(),
  inspectIntent: vi.fn(),
  isGitHubAuthEnabled: vi.fn(),
  requireSameOrigin: vi.fn(),
  sendEmailChallenge: vi.fn(),
  sendVerificationCode: vi.fn(),
  verifyEmail: vi.fn(),
}));

vi.mock("@/lib/admin/setup/access", () => ({
  getSetupAccessDecision: mocks.getSetupDecision,
}));
vi.mock("@/lib/auth/config", () => ({
  isGitHubAuthEnabled: mocks.isGitHubAuthEnabled,
}));
vi.mock("@/lib/auth/session", () => ({
  getOptionalSession: mocks.getOptionalSession,
}));
vi.mock("@/lib/http/request-origin", () => ({
  requireSameOrigin: mocks.requireSameOrigin,
}));
vi.mock("@/lib/auth/social-registration/repository", () => ({
  SOCIAL_REGISTRATION_ATTEMPT_COOKIE:
    "anonresume_social_registration_attempt",
  SOCIAL_REGISTRATION_MAX_AGE_SECONDS: 900,
  cancelSocialRegistrationAttempt: mocks.cancelAttempt,
  createSocialRegistrationAttempt: mocks.createAttempt,
  findSocialRegistrationConflict: mocks.findConflict,
  inspectSocialRegistrationIntent: mocks.inspectIntent,
}));
vi.mock("@/lib/auth/social-registration/email", () => ({
  sendSocialRegistrationEmailChallenge: mocks.sendEmailChallenge,
  verifySocialRegistrationEmail: mocks.verifyEmail,
}));
vi.mock("@/lib/runtime/email", () => ({
  sendSocialRegistrationVerificationCode: mocks.sendVerificationCode,
}));

import { POST as createAttempt } from "@/app/api/registration/social/attempt/route";
import { GET as inspectIntent } from "@/app/api/registration/social/intent/route";
import { GET as resolveResult } from "@/app/api/registration/social/result/route";
import { POST as sendEmailChallenge } from "@/app/api/registration/social/email/challenge/route";
import { POST as verifyEmail } from "@/app/api/registration/social/email/verify/route";

const cookieName = "anonresume_social_registration_attempt";

function request(
  url: string,
  options: {
    body?: unknown;
    consent?: boolean;
    cookie?: string;
    method?: string;
  } = {},
) {
  return new NextRequest(url, {
    method: options.method,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.consent
        ? { "x-anonresume-registration-consent": "true" }
        : {}),
      ...(options.cookie ? { cookie: `${cookieName}=${options.cookie}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

describe("social registration routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSetupDecision.mockResolvedValue("allow");
    mocks.getOptionalSession.mockResolvedValue(null);
    mocks.isGitHubAuthEnabled.mockResolvedValue(true);
    mocks.requireSameOrigin.mockReturnValue(null);
    mocks.createAttempt.mockResolvedValue({
      rawToken: "registration-token",
      expiresAt: new Date("2026-10-10T00:15:00.000Z"),
    });
    mocks.cancelAttempt.mockResolvedValue(true);
    mocks.findConflict.mockResolvedValue(null);
    mocks.inspectIntent.mockResolvedValue({
      state: "password",
      displayName: "GitHub User",
      imageUrl: "https://avatars.example/github",
      email: "github@example.com",
    });
    mocks.sendEmailChallenge.mockResolvedValue({ retryAfterSeconds: 60 });
    mocks.verifyEmail.mockResolvedValue({ email: "new@example.com" });
  });

  it("rejects attempt creation without explicit legal consent", async () => {
    const response = await createAttempt(request(
      "https://resume.example.com/api/registration/social/attempt",
      { method: "POST", body: { provider: "github" } },
    ));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "REGISTRATION_CONSENT_REQUIRED",
      message: "Privacy policy and terms consent is required",
    });
    expect(mocks.createAttempt).not.toHaveBeenCalled();
  });

  it("rejects cross-origin attempt creation", async () => {
    mocks.requireSameOrigin.mockReturnValue(
      Response.json({ error: "forbidden" }, { status: 403 }),
    );

    const response = await createAttempt(request(
      "https://resume.example.com/api/registration/social/attempt",
      {
        method: "POST",
        body: { provider: "github" },
        consent: true,
      },
    ));

    expect(response.status).toBe(403);
    expect(mocks.createAttempt).not.toHaveBeenCalled();
  });

  it("blocks attempt creation while initial setup is pending", async () => {
    mocks.getSetupDecision.mockResolvedValue("require_setup");

    const response = await createAttempt(request(
      "https://resume.example.com/api/registration/social/attempt",
      {
        method: "POST",
        body: { provider: "github" },
        consent: true,
      },
    ));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "instance_setup_required",
    });
  });

  it("creates an HttpOnly attempt and returns product callback URLs", async () => {
    const response = await createAttempt(request(
      "https://resume.example.com/api/registration/social/attempt",
      {
        method: "POST",
        body: { provider: "github" },
        consent: true,
      },
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      callbackURL:
        "/api/registration/social/result?provider=github&outcome=success",
      errorCallbackURL:
        "/api/registration/social/result?provider=github&outcome=error",
    });
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
    expect(response.headers.get("set-cookie")).toContain("Path=/api");
  });

  it("redirects an authenticated callback to the app and cancels the intent", async () => {
    mocks.getOptionalSession.mockResolvedValue({ user: { id: "user-1" } });

    const response = await resolveResult(request(
      "https://resume.example.com/api/registration/social/result?provider=github&outcome=success",
      { cookie: "registration-token" },
    ));

    expect(response.headers.get("location")).toBe("https://resume.example.com/app");
    expect(mocks.cancelAttempt).toHaveBeenCalledWith({
      rawToken: "registration-token",
    });
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("rejects a callback when OAuth profile capture did not complete", async () => {
    mocks.inspectIntent.mockRejectedValue(
      new SocialRegistrationError("profile_missing"),
    );

    const response = await resolveResult(request(
      "https://resume.example.com/api/registration/social/result?provider=github&outcome=error&error=signup_disabled",
      { cookie: "registration-token" },
    ));

    expect(response.headers.get("location")).toBe(
      "https://resume.example.com/sign-in?error=social_registration_invalid",
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("rejects a captured identity when its email already belongs to an account", async () => {
    mocks.findConflict.mockResolvedValue("email");

    const response = await resolveResult(request(
      "https://resume.example.com/api/registration/social/result?provider=github&outcome=error&error=signup_disabled",
      { cookie: "registration-token" },
    ));

    expect(response.headers.get("location")).toBe(
      "https://resume.example.com/sign-in?error=social_registration_account_exists",
    );
    expect(mocks.cancelAttempt).toHaveBeenCalled();
  });

  it("routes a captured new identity to the product registration page", async () => {
    const response = await resolveResult(request(
      "https://resume.example.com/api/registration/social/result?provider=github&outcome=error&error=signup_disabled",
      { cookie: "registration-token" },
    ));

    expect(response.headers.get("location")).toBe(
      "https://resume.example.com/social-registration",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("maps OAuth cancellation to a safe product error", async () => {
    const response = await resolveResult(request(
      "https://resume.example.com/api/registration/social/result?provider=github&outcome=error&error=access_denied",
      { cookie: "registration-token" },
    ));

    expect(response.headers.get("location")).toBe(
      "https://resume.example.com/sign-in?error=social_oauth_cancelled",
    );
    expect(mocks.inspectIntent).not.toHaveBeenCalled();
    expect(mocks.cancelAttempt).toHaveBeenCalled();
  });

  it("returns only the public registration intent view", async () => {
    const response = await inspectIntent(request(
      "https://resume.example.com/api/registration/social/intent",
      { cookie: "registration-token" },
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      state: "password",
      displayName: "GitHub User",
      imageUrl: "https://avatars.example/github",
      email: "github@example.com",
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("sends and verifies a user-supplied email through cookie-bound routes", async () => {
    const challengeResponse = await sendEmailChallenge(request(
      "https://resume.example.com/api/registration/social/email/challenge",
      {
        method: "POST",
        cookie: "registration-token",
        body: { email: "New@Example.com", locale: "en-US" },
      },
    ));

    expect(challengeResponse.status).toBe(200);
    await expect(challengeResponse.json()).resolves.toEqual({
      retryAfterSeconds: 60,
    });
    expect(mocks.sendEmailChallenge).toHaveBeenCalledWith(expect.objectContaining({
      rawToken: "registration-token",
      email: "new@example.com",
    }));

    const verifyResponse = await verifyEmail(request(
      "https://resume.example.com/api/registration/social/email/verify",
      {
        method: "POST",
        cookie: "registration-token",
        body: { code: "123456" },
      },
    ));
    expect(verifyResponse.status).toBe(200);
    await expect(verifyResponse.json()).resolves.toEqual({
      email: "new@example.com",
    });
  });
});
