const mocks = vi.hoisted(() => ({
  betterAuth: vi.fn((options: unknown) => ({
    api: { getSession: vi.fn() },
    options,
  })),
  getRuntimeConfig: vi.fn(),
}));

vi.mock("better-auth", () => ({ betterAuth: mocks.betterAuth }));
vi.mock("better-auth/next-js", () => ({ nextCookies: () => "next-cookies" }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/runtime/database", () => ({ getDatabasePool: () => "database" }));
vi.mock("@/lib/runtime/email", () => ({ sendVerificationEmail: vi.fn() }));
vi.mock("@/lib/config/bootstrap", () => ({
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
});
