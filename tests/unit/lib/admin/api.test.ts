const mocks = vi.hoisted(() => ({
  getAdminRequestContext: vi.fn(),
  getRuntimeConfig: vi.fn(),
  requireRecentAdminReauthentication: vi.fn(),
  writeAdminAuditEvent: vi.fn(),
}));

vi.mock("@/lib/admin/request", () => ({
  getAdminRequestContext: mocks.getAdminRequestContext,
}));
vi.mock("@/lib/admin/audit", () => ({
  writeAdminAuditEvent: mocks.writeAdminAuditEvent,
}));
vi.mock("@/lib/admin/authorization", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/admin/authorization")
  >();
  return {
    ...actual,
    requireRecentAdminReauthentication:
      mocks.requireRecentAdminReauthentication,
  };
});
vi.mock("@/lib/config/runtime", () => ({
  getRuntimeConfig: mocks.getRuntimeConfig,
}));

import { requireAdminApi } from "@/lib/admin/api";
import { getManagedConfigDefaults } from "@/lib/config/registry";

describe("management API runtime configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdminRequestContext.mockResolvedValue({
      adminSessionId: "session-1",
      kind: "super_admin",
      permissions: [],
      reauthenticatedAt: new Date(),
      recoveryRequired: false,
      userId: "admin-1",
    });
  });

  it("uses the current hot reauthentication window for every request", async () => {
    mocks.getRuntimeConfig
      .mockResolvedValueOnce({
        values: {
          ...getManagedConfigDefaults(),
          adminReauthSeconds: 120,
        },
      })
      .mockResolvedValueOnce({
        values: {
          ...getManagedConfigDefaults(),
          adminReauthSeconds: 600,
        },
      });

    await requireAdminApi({ recentMfa: true });
    await requireAdminApi({ recentMfa: true });

    expect(mocks.requireRecentAdminReauthentication).toHaveBeenNthCalledWith(
      1,
      expect.any(Object),
      expect.any(Date),
      120,
      expect.any(Object),
    );
    expect(mocks.requireRecentAdminReauthentication).toHaveBeenNthCalledWith(
      2,
      expect.any(Object),
      expect.any(Date),
      600,
      expect.any(Object),
    );
  });
});
