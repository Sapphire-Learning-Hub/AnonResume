import { randomBytes, randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import {
  db,
  systemConfigRevisions,
  systemConfigRuntimeStates,
  systemConfigValues,
} from "@/db";
import {
  createConfigKeyring,
  type EncryptedConfigSecret,
} from "@/lib/config/crypto";
import { classifyConfigurationHealth } from "@/lib/config/health";
import type { ConfigurationNotifier } from "@/lib/config/notifications";
import { getManagedConfigDefaults, type ManagedConfig } from "@/lib/config/registry";
import { RuntimeConfigManager } from "@/lib/config/runtime";
import {
  ensureConfigurationState,
  getConfigurationState,
  publishConfigurationDraft,
  updateConfigurationDraft,
} from "@/lib/config/store";

class FakeNotifier implements ConfigurationNotifier {
  private listener?: () => void;
  startCalls = 0;

  async start(listener: () => void) {
    this.startCalls += 1;
    this.listener = listener;
  }

  async stop() {
    this.listener = undefined;
  }

  async emit() {
    this.listener?.();
  }
}

describe("runtime configuration snapshots", () => {
  const keyring = createConfigKeyring({ current: randomBytes(32) });

  beforeEach(async () => {
    await db.delete(systemConfigRuntimeStates);
    await db.delete(systemConfigRevisions);
  });

  async function publish(values: Partial<ManagedConfig>) {
    await ensureConfigurationState({ keyring });
    const state = await getConfigurationState({ keyring });
    await updateConfigurationDraft({
      actorUserId: "runtime-test-user",
      baseVersion: state.activeRevision.version,
      draftRevisionId: state.draftRevision.id,
      keyring,
      values,
    });
    return publishConfigurationDraft({
      actorUserId: "runtime-test-user",
      baseVersion: state.activeRevision.version,
      draftRevisionId: state.draftRevision.id,
      keyring,
    });
  }

  function manager(notifier = new FakeNotifier(), now?: () => Date) {
    return new RuntimeConfigManager({
      consumer: "web",
      instanceId: `runtime-test-${randomUUID()}`,
      keyring,
      notifier,
      now,
      pollIntervalMs: 30_000,
      release: "test-release",
    });
  }

  it("atomically replaces hot values while preserving request snapshots", async () => {
    const notifier = new FakeNotifier();
    const runtime = manager(notifier);
    await runtime.start();
    const before = await runtime.snapshot();

    const published = await publish({ resumeVersionHistoryLimit: 12 });
    await notifier.emit();
    await vi.waitFor(async () => {
      expect((await runtime.snapshot()).hotRevisionId).toBe(published.id);
    });
    const after = await runtime.snapshot();

    expect(Object.isFrozen(before)).toBe(true);
    expect(Object.isFrozen(before.values)).toBe(true);
    expect(before.values.resumeVersionHistoryLimit).toBe(5);
    expect(after.values.resumeVersionHistoryLimit).toBe(12);
    expect(after.hotRevisionId).toBe(published.id);
    expect(after.health).toBe("healthy");
    await runtime.stop();
  });

  it("initializes one runtime for concurrent first snapshots", async () => {
    const notifier = new FakeNotifier();
    const runtime = manager(notifier);

    const [first, second] = await Promise.all([
      runtime.snapshot(),
      runtime.snapshot(),
    ]);

    expect(first).toBe(second);
    expect(notifier.startCalls).toBe(1);
    await runtime.stop();
  });

  it("keeps restart values at their startup revision", async () => {
    const notifier = new FakeNotifier();
    const runtime = manager(notifier);
    await runtime.start();
    const initial = await runtime.snapshot();

    const published = await publish({ smtpPort: 2_525 });
    await notifier.emit();
    await vi.waitFor(async () => {
      expect((await runtime.snapshot()).desiredRevisionId).toBe(published.id);
    });
    const refreshed = await runtime.snapshot();

    expect(refreshed.values.smtpPort).toBe(initial.values.smtpPort);
    expect(refreshed.desiredRevisionId).toBe(published.id);
    expect(refreshed.hotRevisionId).toBe(published.id);
    expect(refreshed.restartRevisionId).toBe(initial.restartRevisionId);
    expect(refreshed.health).toBe("restart_required");
    await runtime.stop();
  });

  it("polls for a missed publication notification", async () => {
    let currentTime = new Date("2026-09-20T00:00:00.000Z");
    const runtime = manager(new FakeNotifier(), () => currentTime);
    await runtime.start();
    const published = await publish({ resumeVersionHistoryLimit: 9 });

    currentTime = new Date(currentTime.getTime() + 31_000);
    await runtime.refreshIfDue(currentTime);

    expect((await runtime.snapshot()).hotRevisionId).toBe(published.id);
    expect((await runtime.snapshot()).values.resumeVersionHistoryLimit).toBe(9);
    await runtime.stop();
  });

  it("falls back to the newest readable history without changing revision status", async () => {
    await ensureConfigurationState({ keyring });
    const original = await getConfigurationState({ keyring });
    const published = await publish({ resumeVersionHistoryLimit: 11 });
    await corruptSecret(published.id);

    const runtime = manager();
    await runtime.start();
    const snapshot = await runtime.snapshot();

    expect(snapshot.desiredRevisionId).toBe(published.id);
    expect(snapshot.fallbackRevisionId).toBe(original.activeRevision.id);
    expect(snapshot.hotRevisionId).toBe(original.activeRevision.id);
    expect(snapshot.health).toBe("recovery_required");
    expect(snapshot.lastError).toBe("active_revision_unreadable");
    expect(snapshot.values).toEqual(getManagedConfigDefaults());

    const revisions = await db
      .select({ id: systemConfigRevisions.id, status: systemConfigRevisions.status })
      .from(systemConfigRevisions);
    expect(revisions.find((revision) => revision.id === published.id)?.status).toBe(
      "active",
    );
    expect(
      revisions.find((revision) => revision.id === original.activeRevision.id)?.status,
    ).toBe("superseded");

    const states = await db
      .select()
      .from(systemConfigRuntimeStates)
      .where(eq(systemConfigRuntimeStates.instanceId, snapshot.instanceId));
    expect(states[0]?.lastError).toBe("active_revision_unreadable");
    await runtime.stop();
  });

  it("uses security-safe defaults when no published revision is readable", async () => {
    await ensureConfigurationState({ keyring });
    await publish({
      aiEnabled: true,
      aiPlatformEnabled: true,
      pdfAllowAnonymous: true,
    });
    await db
      .update(systemConfigValues)
      .set({ encryptedValue: invalidEnvelope() })
      .where(eq(systemConfigValues.key, "smtpPassword"));

    const runtime = manager();
    await runtime.start();
    const snapshot = await runtime.snapshot();

    expect(snapshot.health).toBe("recovery_required");
    expect(snapshot.hotRevisionId).toBeNull();
    expect(snapshot.fallbackRevisionId).toBeNull();
    expect(snapshot.lastError).toBe("no_readable_revision");
    expect(snapshot.values.aiEnabled).toBe(false);
    expect(snapshot.values.aiPlatformEnabled).toBe(false);
    expect(snapshot.values.pdfAllowAnonymous).toBe(false);
    expect(snapshot.values.smtpHost).toBe("");
    await runtime.stop();
  });

  it("classifies configuration health by operational severity", () => {
    expect(classifyConfigurationHealth({})).toBe("healthy");
    expect(classifyConfigurationHealth({ restartRequired: true })).toBe(
      "restart_required",
    );
    expect(classifyConfigurationHealth({ degraded: true })).toBe("degraded");
    expect(classifyConfigurationHealth({ recoveryRequired: true })).toBe(
      "recovery_required",
    );
    expect(classifyConfigurationHealth({ bootstrapInvalid: true })).toBe(
      "bootstrap_invalid",
    );
  });

  async function corruptSecret(revisionId: string) {
    await db
      .update(systemConfigValues)
      .set({ encryptedValue: invalidEnvelope() })
      .where(
        and(
          eq(systemConfigValues.revisionId, revisionId),
          eq(systemConfigValues.key, "smtpPassword"),
        ),
      );
  }

  function invalidEnvelope(): EncryptedConfigSecret {
    return {
      algorithm: "aes-256-gcm",
      authTag: "AA==",
      ciphertext: "AA==",
      iv: "AA==",
      keyId: keyring.currentKeyId,
      version: 1,
    };
  }
});
