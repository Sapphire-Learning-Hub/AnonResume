import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  requireManagementSetupCompleted: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/admin/setup/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/setup/access")>()),
  requireManagementSetupCompleted: mocks.requireManagementSetupCompleted,
}));

import {
  requireAdminPage,
  resolveAdminPageFailureDestination,
} from "@/lib/admin/page";
import { AdminSetupAccessError } from "@/lib/admin/setup/access";

describe("resolveAdminPageFailureDestination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps every failure inside the unified application flow", () => {
    expect(resolveAdminPageFailureDestination("recovery", true)).toBe(
      "/app/manage/security",
    );
    expect(resolveAdminPageFailureDestination("unauthenticated", true)).toBe(
      "/app",
    );
    expect(resolveAdminPageFailureDestination("unauthenticated", false)).toBe(
      "/sign-in",
    );
    expect(resolveAdminPageFailureDestination("forbidden", true)).toBe(
      "/app/manage/forbidden",
    );
    expect(resolveAdminPageFailureDestination("instance_recovery", false)).toBe(
      "/setup",
    );
  });

  it("sends management pages to setup during administrator recovery", async () => {
    mocks.requireManagementSetupCompleted.mockRejectedValue(
      new AdminSetupAccessError("admin_recovery_required"),
    );
    mocks.redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(requireAdminPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/setup");
  });
});
