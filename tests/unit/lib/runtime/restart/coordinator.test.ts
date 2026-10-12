import type { RuntimeIdentity } from "@/lib/runtime/instance-identity";
import {
  RuntimeRestartCoordinator,
  type RestartCoordinatorStore,
} from "@/lib/runtime/restart/coordinator";
import type { RuntimeRestartNotifier } from "@/lib/runtime/restart/notifications";

describe("runtime restart coordinator", () => {
  const identity: RuntimeIdentity = {
    deploymentId: "test",
    instanceId: "web-1",
    role: "web",
    sessionId: "session-old",
    stableId: "test/web/web-1",
  };
  const target = {
    consumer: "web" as const,
    expectedSessionId: identity.sessionId,
    instanceId: identity.stableId,
    operationId: "operation-1",
  };

  function createNotifier(): RuntimeRestartNotifier & { emit(): void } {
    let listener: (() => void) | null = null;
    return {
      emit() {
        listener?.();
      },
      async start(nextListener) {
        listener = nextListener;
      },
      async stop() {
        listener = null;
      },
    };
  }

  function createStore(
    claim: RestartCoordinatorStore["claimNextTarget"],
  ): RestartCoordinatorStore {
    return {
      claimNextTarget: claim,
      expireTargets: vi.fn(async () => undefined),
      markAwaitingStartup: vi.fn(async () => true),
      markExiting: vi.fn(async () => true),
      reconcileStartup: vi.fn(async () => undefined),
    };
  }

  it("delivers one drain request and exposes guarded exit transitions", async () => {
    const notifier = createNotifier();
    const store = createStore(vi.fn(async () => target));
    const coordinator = new RuntimeRestartCoordinator({
      getSnapshot: async () => ({
        healthState: "restart_required",
        loadedRestartRevisionId: "revision-old",
      }),
      identity,
      notifier,
      store,
    });

    await coordinator.start();
    const request = await coordinator.waitForDrainRequest();

    expect(request).toMatchObject(target);
    await expect(request.markExiting()).resolves.toBe(true);
    await expect(request.markAwaitingStartup()).resolves.toBe(true);
    expect(store.markExiting).toHaveBeenCalledWith({
      ...target,
      now: expect.any(Date),
    });
    expect(store.markAwaitingStartup).toHaveBeenCalledWith({
      ...target,
      now: expect.any(Date),
    });

    await coordinator.stop();
  });

  it("polls the authoritative store when no notification arrives", async () => {
    vi.useFakeTimers();
    const notifier = createNotifier();
    let attempts = 0;
    const store = createStore(vi.fn(async () => {
      attempts += 1;
      return attempts === 2 ? target : null;
    }));
    const coordinator = new RuntimeRestartCoordinator({
      getSnapshot: async () => ({
        healthState: "restart_required",
        loadedRestartRevisionId: "revision-old",
      }),
      identity,
      notifier,
      pollIntervalMs: 1_000,
      store,
    });

    await coordinator.start();
    const requestPromise = coordinator.waitForDrainRequest();
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(requestPromise).resolves.toMatchObject(target);
    expect(store.claimNextTarget).toHaveBeenCalledTimes(2);

    await coordinator.stop();
    vi.useRealTimers();
  });
});
