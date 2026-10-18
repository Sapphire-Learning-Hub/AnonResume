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

export type MetricAttributes = Attributes;
