import { vi } from "vitest";

const { getAccountLifecycle } = vi.hoisted(() => ({
  getAccountLifecycle: vi.fn(),
}));

vi.mock("@/lib/auth/account/repository", () => ({
  getAccountLifecycle,
}));

import { assertActiveProductAccount } from "@/lib/auth/account/access";

describe("account product access", () => {
  beforeEach(() => {
    getAccountLifecycle.mockReset();
  });

  it("allows an active account", async () => {
    getAccountLifecycle.mockResolvedValue({
      status: "active",
      deletionRequestedAt: null,
      deletionDueAt: null,
      deletedAt: null,
      explicit: false,
    });

    await expect(assertActiveProductAccount("user-1")).resolves.toMatchObject({
      status: "active",
    });
  });

  it.each(["pending_deletion", "deleted"] as const)(
    "denies product access when the account is %s",
    async (status) => {
      getAccountLifecycle.mockResolvedValue({
        status,
        deletionRequestedAt: new Date("2026-10-07T00:00:00.000Z"),
        deletionDueAt: new Date("2026-10-14T00:00:00.000Z"),
        deletedAt:
          status === "deleted"
            ? new Date("2026-10-14T00:00:00.000Z")
            : null,
        explicit: true,
      });

      await expect(assertActiveProductAccount("user-1")).rejects.toEqual(
        expect.objectContaining({ status }),
      );
    },
  );
});
