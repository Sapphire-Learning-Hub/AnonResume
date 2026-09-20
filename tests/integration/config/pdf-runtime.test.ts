import { randomBytes, randomUUID } from "node:crypto";

import { db, systemConfigRevisions, systemConfigRuntimeStates } from "@/db";
import { createConfigKeyring } from "@/lib/config/crypto";
import type { ConfigurationNotifier } from "@/lib/config/notifications";
import type { ManagedConfig } from "@/lib/config/registry";
import { RuntimeConfigManager } from "@/lib/config/runtime";
import {
  ensureConfigurationState,
  getConfigurationState,
  publishConfigurationDraft,
  updateConfigurationDraft,
} from "@/lib/config/store";
import { getPdfExportQueueConfig } from "@/lib/pdf/export-queue";

class FakeNotifier implements ConfigurationNotifier {
  private listener?: () => void;

  async start(listener: () => void) {
    this.listener = listener;
  }

  async stop() {
    this.listener = undefined;
  }

  emit() {
    this.listener?.();
  }
}

describe("PDF worker runtime configuration", () => {
  const keyring = createConfigKeyring({ current: randomBytes(32) });

  beforeEach(async () => {
    await db.delete(systemConfigRuntimeStates);
    await db.delete(systemConfigRevisions);
  });

  async function publish(values: Partial<ManagedConfig>) {
    await ensureConfigurationState({ keyring });
    const state = await getConfigurationState({ keyring });
    await updateConfigurationDraft({
      actorUserId: "pdf-runtime-test-user",
      baseVersion: state.activeRevision.version,
      draftRevisionId: state.draftRevision.id,
      keyring,
      values,
    });
    return publishConfigurationDraft({
      actorUserId: "pdf-runtime-test-user",
      baseVersion: state.activeRevision.version,
      draftRevisionId: state.draftRevision.id,
      keyring,
    });
  }

  it("hot reloads PDF settings while preserving an earlier cycle snapshot", async () => {
    const notifier = new FakeNotifier();
    const runtime = new RuntimeConfigManager({
      consumer: "pdf-worker",
      instanceId: `pdf-runtime-${randomUUID()}`,
      keyring,
      notifier,
      release: "test-release",
    });
    await runtime.start();
    const before = getPdfExportQueueConfig((await runtime.snapshot()).values);

    const published = await publish({ pdfMaxConcurrency: 1 });
    notifier.emit();
    await vi.waitFor(async () => {
      expect((await runtime.snapshot()).hotRevisionId).toBe(published.id);
    });
    const after = getPdfExportQueueConfig((await runtime.snapshot()).values);

    expect(before.maxConcurrency).toBe(2);
    expect(after.maxConcurrency).toBe(1);
    expect(before.maxConcurrency).toBe(2);
    expect(Object.isFrozen(before)).toBe(true);
    expect(Object.isFrozen(after)).toBe(true);
    await runtime.stop();
  });
});
