import { randomBytes, randomUUID } from "node:crypto";

import { and, asc, eq } from "drizzle-orm";

import {
  adminAuditEvents,
  db,
  systemConfigRevisions,
  systemConfigValues,
} from "@/db";
import {
  getManagedConfiguration,
  listConfigurationHistory,
  patchConfigurationDraft,
  prepareConfigurationRollback,
  publishManagedConfiguration,
} from "@/lib/config/admin/service";
import { createConfigKeyring } from "@/lib/config/crypto";
import { ConfigurationRevisionConflictError } from "@/lib/config/store";
import { getDatabasePool } from "@/lib/runtime/database";

describe("configuration administration service", () => {
  const actorUserId = `config-admin-${randomUUID()}`;
  const keyring = createConfigKeyring({ current: randomBytes(32) });

  beforeAll(async () => {
    await getDatabasePool().query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, 'Configuration administrator', $2, true, now(), now())`,
      [actorUserId, `${actorUserId}@example.com`],
    );
  });

  beforeEach(async () => {
    await db.delete(adminAuditEvents).where(eq(adminAuditEvents.actorUserId, actorUserId));
    await db.delete(systemConfigRevisions);
  });

  afterAll(async () => {
    await db.delete(adminAuditEvents).where(eq(adminAuditEvents.actorUserId, actorUserId));
    await db.delete(systemConfigRevisions);
    await getDatabasePool().query(`DELETE FROM "user" WHERE id = $1`, [actorUserId]);
  });

  it("redacts configured secrets and preserves omitted secret values", async () => {
    let state = await getManagedConfiguration({ keyring });
    state = await patchConfigurationDraft({
      actorUserId,
      baseVersion: state.activeRevision.version,
      changes: [
        { key: "smtpHost", operation: "set", value: "smtp.example.com" },
        { key: "smtpUser", operation: "set", value: "resume@example.com" },
        { key: "smtpPassword", operation: "set", value: "secret-value" },
        { key: "emailFrom", operation: "set", value: "resume@example.com" },
      ],
      draftRevisionId: state.draftRevision.id,
      keyring,
    });

    const secret = state.fields.find((field) => field.key === "smtpPassword");
    expect(secret).toMatchObject({ configured: true, sensitive: true });
    expect(secret).not.toHaveProperty("value");
    expect(JSON.stringify(state)).not.toContain("secret-value");

    const before = await db
      .select({ encryptedValue: systemConfigValues.encryptedValue })
      .from(systemConfigValues)
      .where(
        and(
          eq(systemConfigValues.revisionId, state.draftRevision.id),
          eq(systemConfigValues.key, "smtpPassword"),
        ),
      );

    await patchConfigurationDraft({
      actorUserId,
      baseVersion: state.activeRevision.version,
      changes: [{ key: "smtpPort", operation: "set", value: 2_525 }],
      draftRevisionId: state.draftRevision.id,
      keyring,
    });

    const after = await db
      .select({ encryptedValue: systemConfigValues.encryptedValue })
      .from(systemConfigValues)
      .where(
        and(
          eq(systemConfigValues.revisionId, state.draftRevision.id),
          eq(systemConfigValues.key, "smtpPassword"),
        ),
      );
    expect(after[0]?.encryptedValue).toEqual(before[0]?.encryptedValue);
  });

  it("rejects clearing a required secret while its feature remains configured", async () => {
    let state = await getManagedConfiguration({ keyring });
    state = await patchConfigurationDraft({
      actorUserId,
      baseVersion: state.activeRevision.version,
      changes: [
        { key: "smtpHost", operation: "set", value: "smtp.example.com" },
        { key: "smtpUser", operation: "set", value: "resume@example.com" },
        { key: "smtpPassword", operation: "set", value: "secret-value" },
        { key: "emailFrom", operation: "set", value: "resume@example.com" },
      ],
      draftRevisionId: state.draftRevision.id,
      keyring,
    });

    await expect(
      patchConfigurationDraft({
        actorUserId,
        baseVersion: state.activeRevision.version,
        changes: [{ key: "smtpPassword", operation: "clear" }],
        draftRevisionId: state.draftRevision.id,
        keyring,
      }),
    ).rejects.toMatchObject({ code: "configuration_invalid" });
  });

  it("rejects stale draft and active revision preconditions", async () => {
    const state = await getManagedConfiguration({ keyring });

    await expect(
      patchConfigurationDraft({
        actorUserId,
        baseVersion: state.activeRevision.version + 1,
        changes: [{ key: "resumeVersionHistoryLimit", operation: "set", value: 8 }],
        draftRevisionId: state.draftRevision.id,
        keyring,
      }),
    ).rejects.toBeInstanceOf(ConfigurationRevisionConflictError);

    await expect(
      patchConfigurationDraft({
        actorUserId,
        baseVersion: state.activeRevision.version,
        changes: [{ key: "resumeVersionHistoryLimit", operation: "set", value: 8 }],
        draftRevisionId: randomUUID(),
        keyring,
      }),
    ).rejects.toBeInstanceOf(ConfigurationRevisionConflictError);
  });

  it("audits changes and rollback without exposing secret material", async () => {
    let state = await getManagedConfiguration({ keyring });
    state = await patchConfigurationDraft({
      actorUserId,
      baseVersion: state.activeRevision.version,
      changes: [
        { key: "resumeVersionHistoryLimit", operation: "set", value: 9 },
        { key: "githubClientId", operation: "set", value: "client-id" },
        { key: "githubClientSecret", operation: "set", value: "oauth-secret" },
      ],
      draftRevisionId: state.draftRevision.id,
      keyring,
    });
    const published = await publishManagedConfiguration({
      actorUserId,
      baseVersion: state.activeRevision.version,
      draftRevisionId: state.draftRevision.id,
      keyring,
    });

    const history = await listConfigurationHistory({ keyring });
    const original = history.find((revision) => revision.version === 1);
    expect(original).toBeDefined();
    const rollback = await prepareConfigurationRollback({
      actorUserId,
      keyring,
      sourceRevisionId: original!.id,
    });
    expect(rollback.activeRevision.version).toBe(published.activeRevision.version);
    expect(rollback.draftRevision.baseVersion).toBe(published.activeRevision.version);

    const audit = await db
      .select({ action: adminAuditEvents.action, metadata: adminAuditEvents.metadata })
      .from(adminAuditEvents)
      .where(eq(adminAuditEvents.actorUserId, actorUserId))
      .orderBy(asc(adminAuditEvents.createdAt));
    expect(audit.map((event) => event.action)).toEqual([
      "configuration.draft.update",
      "configuration.publish",
      "configuration.rollback",
    ]);
    const serialized = JSON.stringify(audit);
    expect(serialized).toContain("resumeVersionHistoryLimit");
    expect(serialized).toContain('"operation":"set"');
    expect(serialized).not.toContain("oauth-secret");
    expect(serialized).not.toContain("ciphertext");
    expect(serialized).not.toContain("authTag");
  });
});
