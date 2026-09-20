import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSnapshot: vi.fn(),
}));

vi.mock("@/lib/admin/setup/repository", () => ({
  getInstanceSetupSnapshot: mocks.getSnapshot,
}));

import {
  AdminSetupAccessError,
  getSetupAccessDecision,
  requireManagementSetupCompleted,
} from "@/lib/admin/setup/access";

describe("instance setup access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires initial setup for product routes but permits setup and health", async () => {
    mocks.getSnapshot.mockResolvedValue(snapshot("pending_initialization"));

    await expect(getSetupAccessDecision("/app")).resolves.toBe("require_setup");
    await expect(getSetupAccessDecision("/setup")).resolves.toBe("allow");
    await expect(getSetupAccessDecision("/api/setup/claim")).resolves.toBe("allow");
    await expect(getSetupAccessDecision("/api/health/ready")).resolves.toBe("allow");
  });

  it("keeps product access available while management recovery is pending", async () => {
    mocks.getSnapshot.mockResolvedValue(snapshot("pending_admin_recovery"));

    await expect(getSetupAccessDecision("/app")).resolves.toBe("allow");
    await expect(getSetupAccessDecision("/resume/public-slug")).resolves.toBe("allow");
    await expect(getSetupAccessDecision("/app/manage/users")).resolves.toBe(
      "management_recovery",
    );
    await expect(getSetupAccessDecision("/api/manage/users")).resolves.toBe(
      "management_recovery",
    );
  });

  it("uses explicit completed state without inferring from administrator rows", async () => {
    mocks.getSnapshot.mockResolvedValue(snapshot("completed"));

    await expect(getSetupAccessDecision("/app/manage/users")).resolves.toBe(
      "allow",
    );
  });

  it("rejects management authorization for either pending state", async () => {
    mocks.getSnapshot.mockResolvedValue(snapshot("pending_initialization"));
    await expect(requireManagementSetupCompleted()).rejects.toMatchObject({
      code: "instance_setup_required",
    });

    mocks.getSnapshot.mockResolvedValue(snapshot("pending_admin_recovery"));
    await expect(requireManagementSetupCompleted()).rejects.toEqual(
      new AdminSetupAccessError("admin_recovery_required"),
    );
  });
});

function snapshot(
  state: "pending_initialization" | "pending_admin_recovery" | "completed",
) {
  return {
    state,
    targetUserId: null,
    recoveryReason: null,
    completedAt: state === "completed" ? new Date() : null,
    updatedAt: new Date(),
  };
}
