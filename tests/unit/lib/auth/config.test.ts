const mocks = vi.hoisted(() => ({
  betterAuth: vi.fn((options: unknown) => ({
    api: { getSession: vi.fn() },
    options,
  })),
  getRuntimeConfig: vi.fn(),
  invalidateInvitations: vi.fn(),
  isSuperAdminPrincipal: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));

vi.mock("better-auth", () => ({ betterAuth: mocks.betterAuth }));
vi.mock("better-auth/next-js", () => ({ nextCookies: () => "next-cookies" }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/runtime/database", () => ({ getDatabasePool: () => "database" }));
vi.mock("@/lib/runtime/email", () => ({
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: mocks.sendPasswordResetEmail,
}));
vi.mock("@/lib/admin/store", () => ({
  isSuperAdminPrincipal: mocks.isSuperAdminPrincipal,
}));
vi.mock("@/lib/invitations/registration", () => ({
  invalidateInvitationsForIndependentRegistration: mocks.invalidateInvitations,
}));
vi.mock("@/lib/config/bootstrap", () => ({
  getBootstrapNodeEnvironment: () => process.env.NODE_ENV,
  readBootstrapConfig: () => ({
    applicationOrigin: "https://resume.example.com",
    authSecret: "a".repeat(32),
    currentMasterKey: Buffer.alloc(32, 1),
    databaseSchema: "public",
    databaseUrl: "postgresql://example/db",
  }),
}));
vi.mock("@/lib/config/runtime", () => ({
  getRuntimeConfig: mocks.getRuntimeConfig,
}));

import { getAuth, isGitHubAuthEnabled } from "@/lib/auth/config";
import { getManagedConfigDefaults } from "@/lib/config/registry";

function runtimeValues(overrides: Record<string, unknown> = {}) {
  return {
    consumer: "web",
    desiredRevisionId: "revision-1",
    fallbackRevisionId: null,
    health: "healthy",
    hotRevisionId: "revision-1",
    instanceId: "web-test",
    sessionId: "web-test-session",
    lastError: null,
    restartRevisionId: "revision-1",
    values: {
      ...getManagedConfigDefaults(),
      githubClientId: "github-client",
      githubClientSecret: "github-secret",
      ...overrides,
    },
  };
}

describe("restart-scoped Better Auth configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as typeof globalThis & {
      __anonResumeAuthPromise?: Promise<unknown>;
    }).__anonResumeAuthPromise;
    mocks.getRuntimeConfig.mockResolvedValue(runtimeValues());
    mocks.isSuperAdminPrincipal.mockResolvedValue(false);
  });

  it("creates one auth instance for concurrent callers", async () => {
    const [first, second] = await Promise.all([getAuth(), getAuth()]);

    expect(first).toBe(second);
    expect(mocks.betterAuth).toHaveBeenCalledOnce();
    expect(mocks.getRuntimeConfig).toHaveBeenCalledOnce();
  });

  it("holds restart-scoped settings until a new process initializes", async () => {
    const first = await getAuth();
    mocks.getRuntimeConfig.mockResolvedValue(runtimeValues({
      githubClientId: "",
      githubClientSecret: "",
    }));

    await expect(getAuth()).resolves.toBe(first);
    expect(mocks.betterAuth).toHaveBeenCalledOnce();
    expect(await isGitHubAuthEnabled()).toBe(true);

    delete (globalThis as typeof globalThis & {
      __anonResumeAuthPromise?: Promise<unknown>;
    }).__anonResumeAuthPromise;
    const restarted = await getAuth();
    expect(restarted).not.toBe(first);
    expect(mocks.betterAuth).toHaveBeenCalledTimes(2);
    expect(await isGitHubAuthEnabled()).toBe(false);
  });

  it("rebuilds the auth instance when its module hot reloads in development", async () => {
    const first = await getAuth();
    mocks.getRuntimeConfig.mockResolvedValue(runtimeValues({
      githubClientId: "",
      githubClientSecret: "",
    }));
    vi.stubEnv("NODE_ENV", "development");
    vi.resetModules();

    try {
      const { getAuth: getReloadedAuth } = await import("@/lib/auth/config");
      const second = await getReloadedAuth();

      expect(second).not.toBe(first);
      expect(mocks.betterAuth).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("invalidates pending invitations after an independent user registration", async () => {
    await getAuth();
    const options = mocks.betterAuth.mock.calls[0]![0] as {
      databaseHooks: {
        user: { create: { after: (user: { email: string; id: string }) => Promise<void> } };
      };
    };

    await options.databaseHooks.user.create.after({
      email: "new@example.com",
      id: "user-1",
    });

    expect(mocks.invalidateInvitations).toHaveBeenCalledWith(
      "new@example.com",
      "user-1",
    );
  });

  it("sends recovery links to ordinary users and delegated administrators", async () => {
    await getAuth();
    const options = mocks.betterAuth.mock.calls[0]![0] as {
      emailAndPassword: {
        sendResetPassword: (input: {
          user: { id: string; email: string; name: string };
          url: string;
        }) => Promise<void>;
        revokeSessionsOnPasswordReset: boolean;
      };
    };

    await options.emailAndPassword.sendResetPassword({
      user: { id: "user-1", email: "user@example.com", name: "User" },
      url: "https://resume.example.com/api/auth/reset-password/token",
    });

    expect(mocks.sendPasswordResetEmail).toHaveBeenCalledWith({
      email: "user@example.com",
      name: "User",
      url: "https://resume.example.com/api/auth/reset-password/token",
    });
    expect(options.emailAndPassword.revokeSessionsOnPasswordReset).toBe(true);
  });

  it("does not deliver self-service recovery links to the super administrator", async () => {
    mocks.isSuperAdminPrincipal.mockResolvedValue(true);
    await getAuth();
    const options = mocks.betterAuth.mock.calls[0]![0] as {
      emailAndPassword: {
        sendResetPassword: (input: {
          user: { id: string; email: string; name: string };
          url: string;
        }) => Promise<void>;
      };
    };

    await options.emailAndPassword.sendResetPassword({
      user: { id: "super-admin", email: "admin@example.com", name: "Admin" },
      url: "https://resume.example.com/api/auth/reset-password/token",
    });

    expect(mocks.sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});
