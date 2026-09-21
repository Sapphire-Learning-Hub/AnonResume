import { describe, expect, it, vi } from "vitest";

import {
  deactivateInstanceSetup,
  parseSetupDeactivateArguments,
  SetupRecoveryError,
} from "@/lib/admin/setup/recovery";

describe("instance setup recovery", () => {
  it("validates reason and exact deployment confirmation before opening the database", async () => {
    const connect = vi.fn();
    const dependencies = {
      getPool: () => ({ connect }) as never,
      resolveIdentity: () => ({ deploymentId: "production" }),
    };

    await expect(
      deactivateInstanceSetup(
        { deploymentId: "production", reason: "  " },
        dependencies,
      ),
    ).rejects.toMatchObject({ code: "setup_recovery_reason_required" });
    await expect(
      deactivateInstanceSetup(
        { deploymentId: "wrong", reason: "Lost all recovery credentials" },
        dependencies,
      ),
    ).rejects.toMatchObject({ code: "setup_recovery_confirmation_invalid" });
    expect(connect).not.toHaveBeenCalled();
  });

  it("refuses a non-completed instance and inconsistent multiple super-admins", async () => {
    await expect(runWithRows({ state: "pending_admin_recovery" }, [])).rejects
      .toMatchObject({ code: "setup_recovery_unavailable" });
    await expect(
      runWithRows(
        { state: "completed" },
        [{ userId: "admin-1" }, { userId: "admin-2" }],
      ),
    ).rejects.toMatchObject({ code: "setup_recovery_integrity_error" });
  });

  it("parses only the explicit reason and deployment confirmation arguments", () => {
    expect(
      parseSetupDeactivateArguments([
        "--reason",
        "Lost recovery credentials",
        "--confirm",
        "production",
      ]),
    ).toEqual({
      reason: "Lost recovery credentials",
      deploymentId: "production",
    });
    expect(() => parseSetupDeactivateArguments(["--reason", "missing confirm"]))
      .toThrow(SetupRecoveryError);
    expect(() =>
      parseSetupDeactivateArguments([
        "--reason",
        "reason",
        "--confirm",
        "production",
        "--force",
      ]),
    ).toThrow(SetupRecoveryError);
  });
});

async function runWithRows(
  state: { state: string },
  principals: Array<{ userId: string }>,
) {
  const query = vi.fn(async (statement: string) => {
    if (statement.includes("FROM") && statement.includes("instance_setup_state")) {
      return { rows: [state], rowCount: 1 };
    }
    if (statement.includes("FROM") && statement.includes("admin_principals")) {
      return { rows: principals, rowCount: principals.length };
    }
    return { rows: [], rowCount: 0 };
  });
  const release = vi.fn();

  return deactivateInstanceSetup(
    {
      deploymentId: "production",
      reason: "Lost all recovery credentials",
    },
    {
      getPool: () => ({ connect: async () => ({ query, release }) }) as never,
      resolveIdentity: () => ({ deploymentId: "production" }),
    },
  );
}
