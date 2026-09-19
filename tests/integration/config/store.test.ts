import { randomBytes } from "node:crypto";

import { asc, eq, inArray } from "drizzle-orm";

import {
  db,
  systemConfigRevisions,
  systemConfigValues,
} from "@/db";
import { createConfigKeyring } from "@/lib/config/crypto";
import { getManagedConfigDefaults } from "@/lib/config/registry";
import {
  ConfigurationRevisionConflictError,
  createRollbackDraft,
  ensureConfigurationState,
  getConfigurationState,
  publishConfigurationDraft,
  readActiveConfigSnapshot,
  updateConfigurationDraft,
} from "@/lib/config/store";

describe("configuration revision store", () => {
  const keyring = createConfigKeyring({ current: randomBytes(32) });

  beforeEach(async () => {
    await db.delete(systemConfigRevisions);
  });

  it("initializes safe defaults and redacts configured secrets", async () => {
    await ensureConfigurationState({ keyring });

    const initial = await getConfigurationState({ keyring });
    expect(initial.activeRevision.version).toBe(1);
    expect(initial.draftRevision.version).toBe(2);
    expect(initial.draftRevision.baseRevisionId).toBe(initial.activeRevision.id);
    expect((await readActiveConfigSnapshot({ keyring })).values).toEqual(
      getManagedConfigDefaults(),
    );

    await updateConfigurationDraft({
      actorUserId: "configuration-test-user",
      baseVersion: initial.activeRevision.version,
      draftRevisionId: initial.draftRevision.id,
      keyring,
      values: {
        emailFrom: "resume@example.com",
        smtpHost: "smtp.example.com",
        smtpPassword: "do-not-return-this",
        smtpUser: "resume@example.com",
      },
    });

    const updated = await getConfigurationState({ keyring });
    const password = updated.fields.find((field) => field.key === "smtpPassword");
    expect(password).toEqual(expect.objectContaining({ configured: true }));
    expect(password).not.toHaveProperty("value");
    expect(JSON.stringify(updated)).not.toContain("do-not-return-this");
    expect(JSON.stringify(updated)).not.toContain("ciphertext");
  });

  it("publishes a draft once under concurrent requests", async () => {
    await ensureConfigurationState({ keyring });
    const state = await getConfigurationState({ keyring });

    const results = await Promise.allSettled([
      publishConfigurationDraft({
        actorUserId: "configuration-test-user",
        baseVersion: state.activeRevision.version,
        draftRevisionId: state.draftRevision.id,
        keyring,
      }),
      publishConfigurationDraft({
        actorUserId: "configuration-test-user",
        baseVersion: state.activeRevision.version,
        draftRevisionId: state.draftRevision.id,
        keyring,
      }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toEqual(
      expect.objectContaining({
        reason: expect.any(ConfigurationRevisionConflictError),
      }),
    );

    const revisions = await db
      .select()
      .from(systemConfigRevisions)
      .orderBy(asc(systemConfigRevisions.version));
    expect(revisions.filter((revision) => revision.status === "active")).toHaveLength(1);
    expect(revisions.filter((revision) => revision.status === "draft")).toHaveLength(1);
  });

  it("rolls back by publishing a new revision without rewriting history", async () => {
    await ensureConfigurationState({ keyring });
    const initial = await getConfigurationState({ keyring });

    await updateConfigurationDraft({
      actorUserId: "configuration-test-user",
      baseVersion: initial.activeRevision.version,
      draftRevisionId: initial.draftRevision.id,
      keyring,
      values: { resumeVersionHistoryLimit: 12 },
    });
    await publishConfigurationDraft({
      actorUserId: "configuration-test-user",
      baseVersion: initial.activeRevision.version,
      draftRevisionId: initial.draftRevision.id,
      keyring,
    });

    const second = await getConfigurationState({ keyring });
    await updateConfigurationDraft({
      actorUserId: "configuration-test-user",
      baseVersion: second.activeRevision.version,
      draftRevisionId: second.draftRevision.id,
      keyring,
      values: { aiDefaultMonthlyPoints: 0 },
    });
    await publishConfigurationDraft({
      actorUserId: "configuration-test-user",
      baseVersion: second.activeRevision.version,
      draftRevisionId: second.draftRevision.id,
      keyring,
    });

    const historicalIds = [
      initial.activeRevision.id,
      second.activeRevision.id,
    ];
    const historyBefore = await db
      .select()
      .from(systemConfigValues)
      .where(inArray(systemConfigValues.revisionId, historicalIds))
      .orderBy(
        asc(systemConfigValues.revisionId),
        asc(systemConfigValues.key),
      );
    const current = await getConfigurationState({ keyring });
    const rollbackDraft = await createRollbackDraft({
      actorUserId: "configuration-test-user",
      keyring,
      sourceRevisionId: initial.activeRevision.id,
    });
    expect(rollbackDraft.version).toBeGreaterThan(current.draftRevision.version);

    const published = await publishConfigurationDraft({
      actorUserId: "configuration-test-user",
      baseVersion: current.activeRevision.version,
      draftRevisionId: rollbackDraft.id,
      keyring,
    });
    expect(published.version).toBe(rollbackDraft.version);
    expect((await readActiveConfigSnapshot({ keyring })).values).toEqual(
      getManagedConfigDefaults(),
    );

    const historyAfter = await db
      .select()
      .from(systemConfigValues)
      .where(inArray(systemConfigValues.revisionId, historicalIds))
      .orderBy(
        asc(systemConfigValues.revisionId),
        asc(systemConfigValues.key),
      );
    expect(historyAfter).toEqual(historyBefore);

    const source = await db
      .select({ status: systemConfigRevisions.status })
      .from(systemConfigRevisions)
      .where(eq(systemConfigRevisions.id, initial.activeRevision.id));
    expect(source[0]?.status).toBe("superseded");
  });
});
