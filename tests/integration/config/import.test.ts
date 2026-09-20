import { randomBytes } from "node:crypto";

import { count } from "drizzle-orm";

import { db, systemConfigRevisions, systemConfigRuntimeStates } from "@/db";
import { createConfigKeyring } from "@/lib/config/crypto";
import {
  importLegacyManagedConfig,
  LegacyEnvironmentImportConflictError,
} from "@/lib/config/legacy-environment";
import { getConfigurationState } from "@/lib/config/store";

describe("legacy managed environment importer", () => {
  const keyring = createConfigKeyring({ current: randomBytes(32) });

  beforeEach(async () => {
    await db.delete(systemConfigRuntimeStates);
    await db.delete(systemConfigRevisions);
  });

  it("publishes once and reports an unchanged repeated import", async () => {
    const environment = {
      AI_DEFAULT_MONTHLY_POINTS: "0",
      RESUME_VERSION_HISTORY_LIMIT: "9",
    };

    const first = await importLegacyManagedConfig({
      actorUserId: "environment-import-test",
      apply: true,
      environment,
      keyring,
    });
    expect(first.applied).toBe(true);
    expect(first.activeVersion).toBe(2);

    const second = await importLegacyManagedConfig({
      actorUserId: "environment-import-test",
      apply: true,
      environment,
      keyring,
    });
    expect(second.applied).toBe(false);
    expect(second.changedKeys).toEqual([]);
    expect(second.activeVersion).toBe(2);

    const state = await getConfigurationState({ keyring });
    expect(state.activeRevision.version).toBe(2);
    expect(
      state.fields.find((field) => field.key === "resumeVersionHistoryLimit")
        ?.value,
    ).toBe(9);
  });

  it("keeps dry runs read-only", async () => {
    const result = await importLegacyManagedConfig({
      actorUserId: "environment-import-test",
      environment: { RESUME_VERSION_HISTORY_LIMIT: "9" },
      keyring,
    });

    expect(result.applied).toBe(false);
    expect(result.changedKeys).toEqual(["resumeVersionHistoryLimit"]);
    const revisions = await db
      .select({ count: count() })
      .from(systemConfigRevisions);
    expect(revisions[0]?.count).toBe(0);
  });

  it("requires explicit replacement after a managed revision is active", async () => {
    await importLegacyManagedConfig({
      actorUserId: "environment-import-test",
      apply: true,
      environment: { RESUME_VERSION_HISTORY_LIMIT: "8" },
      keyring,
    });

    await expect(
      importLegacyManagedConfig({
        actorUserId: "environment-import-test",
        apply: true,
        environment: { RESUME_VERSION_HISTORY_LIMIT: "10" },
        keyring,
      }),
    ).rejects.toBeInstanceOf(LegacyEnvironmentImportConflictError);

    const replaced = await importLegacyManagedConfig({
      actorUserId: "environment-import-test",
      apply: true,
      environment: { RESUME_VERSION_HISTORY_LIMIT: "10" },
      keyring,
      replaceActive: true,
    });
    expect(replaced.activeVersion).toBe(3);
  });
});
