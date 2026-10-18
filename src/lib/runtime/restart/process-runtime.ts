import type { ConfigConsumer } from "@/lib/config/types";
import {
  getRuntimeConfigManager,
  type RuntimeConfigManager,
} from "@/lib/config/runtime";
import {
  resolveRuntimeIdentity,
  type RuntimeIdentity,
} from "@/lib/runtime/instance-identity";
import {
  RuntimeRestartCoordinator,
  type RuntimeRestartDrainRequest,
} from "@/lib/runtime/restart/coordinator";
import {
  resolveRuntimeSupervisor,
  type RuntimeSupervisorCapability,
} from "@/lib/runtime/restart/supervisor";
import { getLogger } from "@/lib/observability/logging";

const DEFAULT_WEB_RESPONSE_GRACE_MS = 1_500;
const runtimeLog = getLogger("anonresume.runtime");

type RestartRuntimeManager = Pick<
  RuntimeConfigManager,
  "refreshIfDue" | "snapshot" | "start"
>;

interface RestartRuntimeHandle {
  stop(): Promise<void>;
}

interface SharedRuntimeOptions {
  coordinator?: RuntimeRestartCoordinator;
  identity?: RuntimeIdentity;
  runtimeManager?: RestartRuntimeManager;
  supervisor?: RuntimeSupervisorCapability;
}

function processIdentity(
  consumer: ConfigConsumer,
  identity: RuntimeIdentity,
  snapshot: Awaited<ReturnType<RestartRuntimeManager["snapshot"]>>,
): RuntimeIdentity {
  return {
    ...identity,
    role: consumer,
    sessionId: snapshot.sessionId,
    stableId: snapshot.instanceId,
  };
}

async function resolveCoordinator(
  consumer: ConfigConsumer,
  options: SharedRuntimeOptions,
) {
  if (options.coordinator) return options.coordinator;

  const runtimeManager =
    options.runtimeManager ?? getRuntimeConfigManager(consumer);
  await runtimeManager.start();
  const snapshot = await runtimeManager.snapshot();
  const identity = processIdentity(
    consumer,
    options.identity ?? resolveRuntimeIdentity(consumer),
    snapshot,
  );

  return new RuntimeRestartCoordinator({
    async getSnapshot() {
      await runtimeManager.refreshIfDue();
      const current = await runtimeManager.snapshot();
      return {
        healthState: current.health,
        loadedRestartRevisionId: current.restartRevisionId,
      };
    },
    identity,
  });
}

export async function startWebRestartRuntime(
  options: SharedRuntimeOptions & {
    beforeSignal?: () => Promise<void>;
    responseGraceMs?: number;
    schedule?: (callback: () => void, delay: number) => unknown;
    signalProcess?: (signal: NodeJS.Signals) => void;
  } = {},
): Promise<RestartRuntimeHandle> {
  const supervisor = options.supervisor ?? resolveRuntimeSupervisor();
  if (!supervisor.restartSupported) {
    if (!options.coordinator) {
      await (options.runtimeManager ?? getRuntimeConfigManager("web")).start();
    }
    return { async stop() {} };
  }

  const coordinator = await resolveCoordinator("web", options);
  const schedule = options.schedule ?? setTimeout;
  const signalProcess = options.signalProcess ?? ((signal) => {
    process.kill(process.pid, signal);
  });
  await coordinator.start();

  void coordinator.waitForDrainRequest().then(async (request) => {
    if (!await request.markExiting()) return;
    runtimeLog.info("restart_drain_started", {
      labels: { consumer: request.consumer },
      outcome: "success",
      transactionId: request.operationId,
    });
    schedule(() => {
      void (async () => {
        try {
          await options.beforeSignal?.();
        } catch {
          runtimeLog.warn("restart_pre_signal_cleanup_failed", {
            labels: { consumer: request.consumer },
            outcome: "failure",
            transactionId: request.operationId,
          });
        }
        if (!await request.markAwaitingStartup()) return;
        runtimeLog.info("restart_awaiting_startup", {
          labels: { consumer: request.consumer },
          outcome: "success",
          transactionId: request.operationId,
        });
        signalProcess("SIGTERM");
      })();
    }, options.responseGraceMs ?? DEFAULT_WEB_RESPONSE_GRACE_MS);
  }).catch(() => undefined);

  return {
    stop: () => coordinator.stop(),
  };
}

export async function startWorkerRestartRuntime(options: SharedRuntimeOptions & {
  abort(): void;
  consumer: Exclude<ConfigConsumer, "web">;
  work(): Promise<void>;
}) {
  const supervisor = options.supervisor ?? resolveRuntimeSupervisor();
  if (!supervisor.restartSupported) {
    await options.work();
    return;
  }

  const coordinator = await resolveCoordinator(options.consumer, options);
  await coordinator.start();
  const work = options.work();

  try {
    const result = await Promise.race([
      work.then(() => ({ kind: "work" as const })),
      coordinator.waitForDrainRequest().then((request) => ({
        kind: "restart" as const,
        request,
      })),
    ]);
    if (result.kind === "work") return;

    runtimeLog.info("restart_drain_started", {
      labels: { consumer: result.request.consumer },
      outcome: "success",
      transactionId: result.request.operationId,
    });
    options.abort();
    await work;
    await finishWorkerRestart(result.request);
  } finally {
    await coordinator.stop();
  }
}

async function finishWorkerRestart(request: RuntimeRestartDrainRequest) {
  if (!await request.markExiting()) return;
  if (await request.markAwaitingStartup()) {
    runtimeLog.info("restart_awaiting_startup", {
      labels: { consumer: request.consumer },
      outcome: "success",
      transactionId: request.operationId,
    });
  }
}
