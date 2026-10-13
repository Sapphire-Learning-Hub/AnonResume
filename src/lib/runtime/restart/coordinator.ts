import type { SystemConfigHealthState } from "@/db/config-schema";
import type { RuntimeIdentity } from "@/lib/runtime/instance-identity";
import {
  claimNextSystemRestartTarget,
  expireSystemRestartTargets,
  markSystemRestartTargetAwaitingStartup,
  markSystemRestartTargetExiting,
  reconcileSystemRestartTargetStartup,
  type SystemRestartTargetClaim,
} from "@/lib/runtime/restart/store";
import {
  notifyRuntimeRestart,
  PostgresRuntimeRestartNotifier,
  type RuntimeRestartNotifier,
} from "@/lib/runtime/restart/notifications";

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_STARTUP_TIMEOUT_MS = 120_000;
const DEFAULT_WORKER_DRAIN_TIMEOUT_MS = 600_000;

interface RestartRuntimeSnapshot {
  healthState: SystemConfigHealthState;
  loadedRestartRevisionId: string | null;
}

type ClaimInput = Parameters<typeof claimNextSystemRestartTarget>[0];
type TransitionInput = Parameters<typeof markSystemRestartTargetExiting>[0];
type ReconcileInput = Parameters<
  typeof reconcileSystemRestartTargetStartup
>[0];

export interface RestartCoordinatorStore {
  claimNextTarget(input: ClaimInput): Promise<SystemRestartTargetClaim | null>;
  expireTargets(input: {
    now: Date;
    startupTimeoutMs: number;
    workerDrainTimeoutMs: number;
  }): Promise<number | void>;
  markAwaitingStartup(input: TransitionInput): Promise<boolean>;
  markExiting(input: TransitionInput): Promise<boolean>;
  reconcileStartup(input: ReconcileInput): Promise<unknown>;
}

export interface RuntimeRestartDrainRequest extends SystemRestartTargetClaim {
  markAwaitingStartup(): Promise<boolean>;
  markExiting(): Promise<boolean>;
}

interface RuntimeRestartCoordinatorOptions {
  getSnapshot(): Promise<RestartRuntimeSnapshot>;
  identity: RuntimeIdentity;
  notifier?: RuntimeRestartNotifier;
  notify?: () => Promise<void>;
  now?: () => Date;
  pollIntervalMs?: number;
  startupTimeoutMs?: number;
  store?: RestartCoordinatorStore;
  workerDrainTimeoutMs?: number;
}

const DEFAULT_STORE: RestartCoordinatorStore = {
  claimNextTarget: claimNextSystemRestartTarget,
  expireTargets: expireSystemRestartTargets,
  markAwaitingStartup: markSystemRestartTargetAwaitingStartup,
  markExiting: markSystemRestartTargetExiting,
  reconcileStartup: reconcileSystemRestartTargetStartup,
};

export class RuntimeRestartCoordinator {
  private readonly getSnapshot: () => Promise<RestartRuntimeSnapshot>;
  private readonly identity: RuntimeIdentity;
  private readonly notifier: RuntimeRestartNotifier;
  private readonly notify: () => Promise<void>;
  private readonly now: () => Date;
  private readonly pollIntervalMs: number;
  private readonly startupTimeoutMs: number;
  private readonly store: RestartCoordinatorStore;
  private readonly workerDrainTimeoutMs: number;
  private drainRequests: RuntimeRestartDrainRequest[] = [];
  private drainWaiters: Array<(request: RuntimeRestartDrainRequest) => void> = [];
  private pollPromise: Promise<void> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;

  constructor(options: RuntimeRestartCoordinatorOptions) {
    this.getSnapshot = options.getSnapshot;
    this.identity = options.identity;
    this.notifier = options.notifier ?? new PostgresRuntimeRestartNotifier();
    this.notify = options.notify ?? notifyRuntimeRestart;
    this.now = options.now ?? (() => new Date());
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.startupTimeoutMs =
      options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;
    this.store = options.store ?? DEFAULT_STORE;
    this.workerDrainTimeoutMs =
      options.workerDrainTimeoutMs ?? DEFAULT_WORKER_DRAIN_TIMEOUT_MS;
  }

  async start() {
    if (this.started) return;
    this.started = true;
    try {
      await this.notifier.start(() => {
        void this.poll().catch(() => undefined);
      });
    } catch {
      // Polling remains authoritative when LISTEN is temporarily unavailable.
    }
    this.pollTimer = setInterval(() => {
      void this.poll().catch(() => undefined);
    }, this.pollIntervalMs);
    this.pollTimer.unref?.();
    await this.poll().catch(() => undefined);
  }

  async stop() {
    if (!this.started) return;
    this.started = false;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    await this.notifier.stop();
  }

  async poll() {
    if (this.pollPromise) return this.pollPromise;
    this.pollPromise = this.performPoll().finally(() => {
      this.pollPromise = null;
    });
    return this.pollPromise;
  }

  waitForDrainRequest(): Promise<RuntimeRestartDrainRequest> {
    const request = this.drainRequests.shift();
    if (request) return Promise.resolve(request);
    return new Promise((resolve) => {
      this.drainWaiters.push(resolve);
    });
  }

  private async performPoll() {
    const now = this.now();
    const expired = await this.store.expireTargets({
      now,
      startupTimeoutMs: this.startupTimeoutMs,
      workerDrainTimeoutMs: this.workerDrainTimeoutMs,
    });
    if (expired) await this.notify().catch(() => undefined);

    const snapshot = await this.getSnapshot();
    const reconciled = await this.store.reconcileStartup({
      consumer: this.identity.role,
      deploymentId: this.identity.deploymentId,
      healthState: snapshot.healthState,
      loadedRestartRevisionId: snapshot.loadedRestartRevisionId,
      now,
      sessionId: this.identity.sessionId,
      stableId: this.identity.stableId,
    });
    if (reconciled) await this.notify().catch(() => undefined);

    const claim = await this.store.claimNextTarget({
      consumer: this.identity.role,
      deploymentId: this.identity.deploymentId,
      now,
      sessionId: this.identity.sessionId,
      stableId: this.identity.stableId,
    });
    if (claim) this.deliverDrainRequest(this.createDrainRequest(claim));
  }

  private createDrainRequest(
    claim: SystemRestartTargetClaim,
  ): RuntimeRestartDrainRequest {
    const transition = async (
      update: RestartCoordinatorStore["markExiting"] | RestartCoordinatorStore["markAwaitingStartup"],
    ) => {
      const changed = await update({ ...claim, now: this.now() });
      if (changed) await this.notify().catch(() => undefined);
      return changed;
    };

    return {
      ...claim,
      markAwaitingStartup: () => transition(this.store.markAwaitingStartup),
      markExiting: () => transition(this.store.markExiting),
    };
  }

  private deliverDrainRequest(request: RuntimeRestartDrainRequest) {
    const waiter = this.drainWaiters.shift();
    if (waiter) waiter(request);
    else this.drainRequests.push(request);
  }
}
