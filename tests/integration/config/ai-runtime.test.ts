import { randomBytes, randomUUID } from "node:crypto";

import { db, systemConfigRevisions, systemConfigRuntimeStates } from "@/db";
import { resolveAiConfiguration } from "@/lib/ai/config/configuration";
import { getAiWorkerConfiguration } from "@/lib/ai/worker";
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

describe("AI runtime configuration", () => {
  const keyring = createConfigKeyring({ current: randomBytes(32) });
  const encryptionKey = Buffer.alloc(32, 7);

  beforeEach(async () => {
    await db.delete(systemConfigRuntimeStates);
    await db.delete(systemConfigRevisions);
  });

  async function publish(values: Partial<ManagedConfig>) {
    await ensureConfigurationState({ keyring });
    const state = await getConfigurationState({ keyring });
    await updateConfigurationDraft({
      actorUserId: "ai-runtime-test-user",
      baseVersion: state.activeRevision.version,
      draftRevisionId: state.draftRevision.id,
      keyring,
      values,
    });
    return publishConfigurationDraft({
      actorUserId: "ai-runtime-test-user",
      baseVersion: state.activeRevision.version,
      draftRevisionId: state.draftRevision.id,
      keyring,
    });
  }

  it("applies published limits only to subsequent snapshots", async () => {
    const notifier = new FakeNotifier();
    const runtime = new RuntimeConfigManager({
      consumer: "ai-worker",
      instanceId: `ai-runtime-${randomUUID()}`,
      keyring,
      notifier,
      release: "test-release",
    });
    await runtime.start();
    const initialSnapshot = await runtime.snapshot();
    const before = resolveAiConfiguration(
      initialSnapshot.values,
      encryptionKey,
    );
    const beforeWorker = getAiWorkerConfiguration(initialSnapshot.values);

    const published = await publish({
      aiEnabled: true,
      aiRequestsPerMinute: 1,
      aiWorkerPollIntervalMs: 1_000,
    });
    notifier.emit();
    await vi.waitFor(async () => {
      expect((await runtime.snapshot()).hotRevisionId).toBe(published.id);
    });
    const refreshedSnapshot = await runtime.snapshot();
    const after = resolveAiConfiguration(
      refreshedSnapshot.values,
      encryptionKey,
    );
    const afterWorker = getAiWorkerConfiguration(refreshedSnapshot.values);

    expect(before.enabled).toBe(false);
    expect(before.requestsPerMinute).toBe(10);
    expect(beforeWorker.pollIntervalMs).toBe(5_000);
    expect(after.enabled).toBe(true);
    expect(after.requestsPerMinute).toBe(1);
    expect(afterWorker.pollIntervalMs).toBe(1_000);
    expect(before.requestsPerMinute).toBe(10);
    expect(Object.isFrozen(after)).toBe(true);
    await runtime.stop();
  });
});
