import {
  AdminBootstrapConflictError,
  AdminSingletonViolationError,
  PostgresAdminBootstrapStore,
  bootstrapConfiguredSuperAdmin,
  bootstrapSuperAdmin,
  type AdminBootstrapStore,
  type AdminBootstrapTransaction,
} from "@/lib/admin/bootstrap";

vi.mock("@/lib/runtime/email", () => ({
  sendSuperAdminActivationEmail: vi.fn(async () => undefined),
}));

function createStore(
  transaction: Partial<AdminBootstrapTransaction> = {},
): AdminBootstrapStore {
  const tx: AdminBootstrapTransaction = {
    listActiveSuperAdmins: vi.fn(async () => []),
    findIdentityByEmail: vi.fn(async () => null),
    createPendingIdentity: vi.fn(async () => ({ userId: "super-user" })),
    createSuperAdminPrincipal: vi.fn(async () => undefined),
    createActivationToken: vi.fn(async () => undefined),
    ...transaction,
  };

  return {
    withBootstrapLock: (callback) => callback(tx),
  };
}

describe("super-admin bootstrap", () => {
  it("runs configured bootstrap in development", async () => {
    const store = createStore();
    const lock = vi
      .spyOn(PostgresAdminBootstrapStore.prototype, "withBootstrapLock")
      .mockImplementation(store.withBootstrapLock);

    await expect(
      bootstrapConfiguredSuperAdmin({
        NODE_ENV: "development",
        ANONRESUME_SUPER_ADMIN_EMAIL: "owner@example.com",
        BETTER_AUTH_URL: "http://localhost:3000",
      }),
    ).resolves.toMatchObject({ state: "created", userId: "super-user" });
    expect(lock).toHaveBeenCalledOnce();
  });

  it("creates exactly one pending identity and sends its activation link", async () => {
    const store = createStore();
    const deliverActivation = vi.fn(async () => undefined);

    const result = await bootstrapSuperAdmin({
      store,
      email: "owner@example.com",
      applicationOrigin: "https://resume.example.com",
      deliverActivation,
    });

    expect(result).toMatchObject({ state: "created", userId: "super-user" });
    expect(deliverActivation).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "owner@example.com",
        url: expect.stringMatching(
          /^https:\/\/resume\.example\.com\/activate\?token=/,
        ),
      }),
    );
  });

  it("is idempotent when the singleton already exists", async () => {
    const deliverActivation = vi.fn(async () => undefined);
    const store = createStore({
      listActiveSuperAdmins: vi.fn(async () => [{ userId: "existing" }]),
    });

    await expect(
      bootstrapSuperAdmin({
        store,
        email: "owner@example.com",
        applicationOrigin: "https://resume.example.com",
        deliverActivation,
      }),
    ).resolves.toEqual({ state: "existing", userId: "existing" });
    expect(deliverActivation).not.toHaveBeenCalled();
  });

  it("blocks startup when multiple active super-admins are detected", async () => {
    const store = createStore({
      listActiveSuperAdmins: vi.fn(async () => [
        { userId: "first" },
        { userId: "second" },
      ]),
    });

    await expect(
      bootstrapSuperAdmin({
        store,
        email: "owner@example.com",
        applicationOrigin: "https://resume.example.com",
        deliverActivation: vi.fn(),
      }),
    ).rejects.toBeInstanceOf(AdminSingletonViolationError);
  });

  it("does not silently convert an existing product identity", async () => {
    const store = createStore({
      findIdentityByEmail: vi.fn(async () => ({ userId: "normal-user" })),
    });

    await expect(
      bootstrapSuperAdmin({
        store,
        email: "owner@example.com",
        applicationOrigin: "https://resume.example.com",
        deliverActivation: vi.fn(),
      }),
    ).rejects.toBeInstanceOf(AdminBootstrapConflictError);
  });
});
