import { getLogger, serializeSafeError } from "@/lib/observability/logging";

import { applicationMetrics } from "./instruments";

interface QueueSnapshot {
  counts: Readonly<Record<string, number>>;
  oldestQueuedAt: Date | null;
}

interface QueueMetricsSource {
  jobType: "ai" | "pdf";
  readSnapshot(): Promise<QueueSnapshot>;
}

interface QueueMetricsScheduler {
  schedule(callback: () => void, intervalMs: number): { cancel(): void };
}

interface QueueMetricsSamplerOptions {
  intervalMs?: number;
  now?: () => Date;
  scheduler?: QueueMetricsScheduler;
  sources: readonly QueueMetricsSource[];
}

const queueLog = getLogger("anonresume.metrics");
const DEFAULT_INTERVAL_MS = 15_000;
const defaultScheduler: QueueMetricsScheduler = {
  schedule(callback, intervalMs) {
    const timer = setInterval(callback, intervalMs);
    timer.unref();
    return { cancel: () => clearInterval(timer) };
  },
};

export function startQueueMetricsSampler(
  options: QueueMetricsSamplerOptions,
) {
  const now = options.now ?? (() => new Date());
  let inFlight: Promise<void> | undefined;
  let stopped = false;

  const refresh = () => {
    if (stopped) return Promise.resolve();
    if (inFlight) return inFlight;
    const current = now();
    inFlight = Promise.all(
      options.sources.map(async (source) => {
        try {
          const snapshot = await source.readSnapshot();
          applicationMetrics.recordQueueSnapshot({
            counts: snapshot.counts,
            jobType: source.jobType,
            oldestQueuedAgeSeconds: snapshot.oldestQueuedAt
              ? Math.max(
                  0,
                  (current.getTime() - snapshot.oldestQueuedAt.getTime()) / 1_000,
                )
              : 0,
          });
        } catch (error) {
          applicationMetrics.recordWorkerOperationFailure({
            operation: "queue_sample",
            workerType: source.jobType,
          });
          queueLog.warn("queue_metrics_sample_failed", {
            error: serializeSafeError(error),
            labels: { jobType: source.jobType },
            outcome: "failure",
          });
        }
      }),
    ).then(() => undefined).finally(() => {
      inFlight = undefined;
    });
    return inFlight;
  };

  void refresh();
  const scheduled = (options.scheduler ?? defaultScheduler).schedule(
    () => void refresh(),
    options.intervalMs ?? DEFAULT_INTERVAL_MS,
  );

  return {
    refresh,
    stop() {
      if (stopped) return;
      stopped = true;
      scheduled.cancel();
    },
  };
}
