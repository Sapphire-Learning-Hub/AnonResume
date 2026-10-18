import type { Attributes } from "@opentelemetry/api";

export type MetricOutcome = "success" | "failure" | "cancelled" | "unknown";
export type MetricJobType = "ai" | "pdf" | "unknown";

export interface HttpMetricInput {
  method: string;
  routePattern: string;
}

export interface HttpMetricCompletion extends HttpMetricInput {
  durationSeconds: number;
  outcome: string;
  statusCode?: number;
}

export interface JobMetricInput {
  jobType: string;
  outcome: string;
}

export interface JobMetricStart {
  jobType: string;
  queueWaitSeconds: number;
}

export interface JobMetricCompletion extends JobMetricInput {
  durationSeconds: number;
}

export interface QueueMetricsSnapshot {
  counts: Readonly<Record<string, number>>;
  jobType: string;
  oldestQueuedAgeSeconds: number;
}

export interface WorkerMetricInput {
  outcome: string;
  workerType: string;
}

export interface WorkerOperationFailureMetric {
  operation: string;
  workerType: string;
}

export interface RuntimeMetricsSnapshot {
  cpuSystemSeconds: number;
  cpuUserSeconds: number;
  database: {
    active: number;
    idle: number;
    total: number;
    waiting: number;
  };
  eventLoopDelayMeanSeconds: number;
  eventLoopDelayP99Seconds: number;
  memory: {
    arrayBuffers: number;
    external: number;
    heapTotal: number;
    heapUsed: number;
    rss: number;
  };
  uptimeSeconds: number;
}

export type MetricAttributes = Attributes;
