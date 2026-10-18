import type { Meter } from "@opentelemetry/api";

import {
  normalizeHttpActiveAttributes,
  normalizeHttpMetricAttributes,
  normalizeJobMetricAttributes,
  normalizeJobTypeAttributes,
  normalizeMetricOutcome,
} from "./attributes";
import type {
  HttpMetricCompletion,
  HttpMetricInput,
  JobMetricCompletion,
  JobMetricStart,
  MetricAttributes,
  QueueMetricsSnapshot,
  RuntimeMetricsSnapshot,
  RuntimeConfigurationHealth,
  WorkerMetricInput,
  WorkerOperationFailureMetric,
} from "./types";

const QUEUE_STATES = new Set([
  "cancelled",
  "complete",
  "completed",
  "failed",
  "interrupted",
  "preparing",
  "queued",
  "running",
  "settlement_pending",
  "stopped",
  "streaming",
]);
const WORKER_TYPES = new Set(["ai", "pdf", "web"]);
const WORKER_OPERATIONS = new Set([
  "claim",
  "cleanup",
  "heartbeat",
  "poll",
  "queue_sample",
  "recovery",
  "retention",
]);
const CONFIGURATION_HEALTH_STATES = [
  "healthy",
  "restart_required",
  "degraded",
  "recovery_required",
] as const satisfies readonly RuntimeConfigurationHealth[];

interface ApplicationInstrumentBindings {
  databaseConnections: {
    record(value: number, attributes?: MetricAttributes): void;
  };
  httpActiveRequests: {
    add(value: number, attributes?: MetricAttributes): void;
  };
  httpRequestDuration: {
    record(value: number, attributes?: MetricAttributes): void;
  };
  httpRequests: {
    add(value: number, attributes?: MetricAttributes): void;
  };
  jobsActive: {
    add(value: number, attributes?: MetricAttributes): void;
  };
  jobsCompleted: {
    add(value: number, attributes?: MetricAttributes): void;
  };
  jobsDuration: {
    record(value: number, attributes?: MetricAttributes): void;
  };
  jobsQueueWait: {
    record(value: number, attributes?: MetricAttributes): void;
  };
  jobsStarted: {
    add(value: number, attributes?: MetricAttributes): void;
  };
  processCpuTime: {
    add(value: number, attributes?: MetricAttributes): void;
  };
  processEventLoopDelay: {
    record(value: number, attributes?: MetricAttributes): void;
  };
  processMemoryUsage: {
    record(value: number, attributes?: MetricAttributes): void;
  };
  processUptime: {
    record(value: number, attributes?: MetricAttributes): void;
  };
  queueJobs: {
    record(value: number, attributes?: MetricAttributes): void;
  };
  queueOldestAge: {
    record(value: number, attributes?: MetricAttributes): void;
  };
  runtimeConfigurationHealth: {
    record(value: number, attributes?: MetricAttributes): void;
  };
  workerHeartbeat: {
    add(value: number, attributes?: MetricAttributes): void;
  };
  workerOperationFailures: {
    add(value: number, attributes?: MetricAttributes): void;
  };
}

function createApplicationInstrumentBindings(
  meter: Meter,
): ApplicationInstrumentBindings {
  return {
    databaseConnections: meter.createGauge(
      "anonresume.db.client.connections",
      {
        description: "PostgreSQL client connections by state",
        unit: "{connection}",
      },
    ),
    httpActiveRequests: meter.createUpDownCounter(
      "anonresume.http.server.active_requests",
      {
        description: "Number of HTTP API requests currently being processed",
        unit: "{request}",
      },
    ),
    httpRequestDuration: meter.createHistogram(
      "anonresume.http.server.request.duration",
      {
        advice: {
          explicitBucketBoundaries: [
            0.005,
            0.01,
            0.025,
            0.05,
            0.1,
            0.25,
            0.5,
            1,
            2.5,
            5,
            10,
          ],
        },
        description: "HTTP API request duration",
        unit: "s",
      },
    ),
    httpRequests: meter.createCounter("anonresume.http.server.requests", {
      description: "Number of completed HTTP API requests",
      unit: "{request}",
    }),
    jobsActive: meter.createUpDownCounter("anonresume.jobs.active", {
      description: "Number of jobs currently being processed",
      unit: "{job}",
    }),
    jobsCompleted: meter.createCounter("anonresume.jobs.completed", {
      description: "Number of completed jobs by outcome",
      unit: "{job}",
    }),
    jobsDuration: meter.createHistogram("anonresume.jobs.duration", {
      description: "Job processing duration",
      unit: "s",
    }),
    jobsQueueWait: meter.createHistogram(
      "anonresume.jobs.queue_wait.duration",
      {
        description: "Time a job waited before being claimed",
        unit: "s",
      },
    ),
    jobsStarted: meter.createCounter("anonresume.jobs.started", {
      description: "Number of jobs started",
      unit: "{job}",
    }),
    processCpuTime: meter.createCounter("anonresume.process.cpu.time", {
      description: "CPU time consumed by the process",
      unit: "s",
    }),
    processEventLoopDelay: meter.createGauge(
      "anonresume.process.event_loop.delay",
      {
        description: "Node.js event loop delay",
        unit: "s",
      },
    ),
    processMemoryUsage: meter.createGauge(
      "anonresume.process.memory.usage",
      {
        description: "Memory used by the process",
        unit: "By",
      },
    ),
    processUptime: meter.createGauge("anonresume.process.uptime", {
      description: "Process uptime",
      unit: "s",
    }),
    queueJobs: meter.createGauge("anonresume.queue.jobs", {
      description: "Jobs in the shared queue by state",
      unit: "{job}",
    }),
    queueOldestAge: meter.createGauge(
      "anonresume.queue.oldest_queued.age",
      {
        description: "Age of the oldest queued job",
        unit: "s",
      },
    ),
    runtimeConfigurationHealth: meter.createGauge(
      "anonresume.runtime.configuration.health",
      {
        description: "Runtime managed configuration health by state",
        unit: "1",
      },
    ),
    workerHeartbeat: meter.createCounter("anonresume.worker.heartbeat", {
      description: "Worker heartbeat attempts by outcome",
      unit: "{heartbeat}",
    }),
    workerOperationFailures: meter.createCounter(
      "anonresume.worker.operation.failures",
      {
        description: "Worker operation failures",
        unit: "{failure}",
      },
    ),
  };
}

class ApplicationMetrics {
  private bindings?: ApplicationInstrumentBindings;

  bind(meter: Meter) {
    const bindings = createApplicationInstrumentBindings(meter);
    this.bindings = bindings;
    return () => {
      if (this.bindings === bindings) this.bindings = undefined;
    };
  }

  recordHttpRequestStarted(input: HttpMetricInput) {
    this.bindings?.httpActiveRequests.add(
      1,
      normalizeHttpActiveAttributes(input),
    );
  }

  recordHttpRequestCompleted(input: HttpMetricCompletion) {
    const attributes = normalizeHttpMetricAttributes(input);
    this.bindings?.httpActiveRequests.add(
      -1,
      normalizeHttpActiveAttributes(input),
    );
    this.bindings?.httpRequests.add(1, attributes);
    this.bindings?.httpRequestDuration.record(
      Math.max(0, input.durationSeconds),
      attributes,
    );
  }

  recordRuntimeSnapshot(snapshot: RuntimeMetricsSnapshot) {
    const bindings = this.bindings;
    if (!bindings) return;

    for (const [state, value] of Object.entries(snapshot.database)) {
      bindings.databaseConnections.record(value, { state });
    }
    bindings.processCpuTime.add(snapshot.cpuSystemSeconds, { mode: "system" });
    bindings.processCpuTime.add(snapshot.cpuUserSeconds, { mode: "user" });
    bindings.processEventLoopDelay.record(
      snapshot.eventLoopDelayMeanSeconds,
      { quantile: "mean" },
    );
    bindings.processEventLoopDelay.record(
      snapshot.eventLoopDelayP99Seconds,
      { quantile: "p99" },
    );
    for (const [type, value] of Object.entries(snapshot.memory)) {
      bindings.processMemoryUsage.record(value, { type });
    }
    bindings.processUptime.record(snapshot.uptimeSeconds);
  }

  recordRuntimeConfigurationHealth(state: RuntimeConfigurationHealth) {
    for (const candidate of CONFIGURATION_HEALTH_STATES) {
      this.bindings?.runtimeConfigurationHealth.record(
        candidate === state ? 1 : 0,
        { state: candidate },
      );
    }
  }

  recordJobStarted(input: JobMetricStart) {
    const attributes = normalizeJobTypeAttributes(input.jobType);
    this.bindings?.jobsStarted.add(1, attributes);
    this.bindings?.jobsActive.add(1, attributes);
    this.bindings?.jobsQueueWait.record(
      Math.max(0, input.queueWaitSeconds),
      attributes,
    );
  }

  recordJobCompleted(input: JobMetricCompletion) {
    const typeAttributes = normalizeJobTypeAttributes(input.jobType);
    this.bindings?.jobsActive.add(-1, typeAttributes);
    const attributes = normalizeJobMetricAttributes(input);
    this.bindings?.jobsCompleted.add(1, attributes);
    this.bindings?.jobsDuration.record(
      Math.max(0, input.durationSeconds),
      attributes,
    );
  }

  recordQueueSnapshot(snapshot: QueueMetricsSnapshot) {
    const typeAttributes = normalizeJobTypeAttributes(snapshot.jobType);
    for (const [state, value] of Object.entries(snapshot.counts)) {
      if (!QUEUE_STATES.has(state)) continue;
      this.bindings?.queueJobs.record(Math.max(0, value), {
        ...typeAttributes,
        "queue.state": state,
      });
    }
    this.bindings?.queueOldestAge.record(
      Math.max(0, snapshot.oldestQueuedAgeSeconds),
      typeAttributes,
    );
  }

  recordWorkerHeartbeat(input: WorkerMetricInput) {
    this.bindings?.workerHeartbeat.add(1, {
      "event.outcome": normalizeMetricOutcome(input.outcome),
      "worker.type": WORKER_TYPES.has(input.workerType)
        ? input.workerType
        : "unknown",
    });
  }

  recordWorkerOperationFailure(input: WorkerOperationFailureMetric) {
    this.bindings?.workerOperationFailures.add(1, {
      operation: WORKER_OPERATIONS.has(input.operation)
        ? input.operation
        : "unknown",
      "worker.type": WORKER_TYPES.has(input.workerType)
        ? input.workerType
        : "unknown",
    });
  }
}

export const applicationMetrics = new ApplicationMetrics();
