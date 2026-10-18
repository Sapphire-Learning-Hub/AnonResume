import type {
  HttpMetricCompletion,
  HttpMetricInput,
  JobMetricInput,
  MetricAttributes,
  MetricJobType,
  MetricOutcome,
} from "./types";

const HTTP_METHODS = new Set([
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
]);
const OUTCOMES = new Set<MetricOutcome>([
  "cancelled",
  "failure",
  "success",
  "unknown",
]);
const JOB_TYPES = new Set<MetricJobType>(["ai", "pdf", "unknown"]);
const SAFE_ROUTE_PATTERN =
  /^\/api(?:\/(?:[A-Za-z0-9_-]+|\[(?:\.\.\.)?[A-Za-z0-9_-]+\])){0,8}$/;

function normalizeOutcome(value: string): MetricOutcome {
  return OUTCOMES.has(value as MetricOutcome)
    ? value as MetricOutcome
    : "unknown";
}

function normalizeStatusClass(statusCode: number | undefined) {
  if (
    statusCode === undefined ||
    !Number.isInteger(statusCode) ||
    statusCode < 100 ||
    statusCode > 599
  ) {
    return "unknown";
  }
  return `${Math.floor(statusCode / 100)}xx`;
}

export function normalizeHttpActiveAttributes(
  input: HttpMetricInput,
): MetricAttributes {
  const method = input.method.toUpperCase();
  return {
    "http.request.method": HTTP_METHODS.has(method) ? method : "OTHER",
    "http.route": SAFE_ROUTE_PATTERN.test(input.routePattern)
      ? input.routePattern
      : "/api/unknown",
  };
}

export function normalizeHttpMetricAttributes(
  input: Omit<HttpMetricCompletion, "durationSeconds">,
): MetricAttributes {
  return {
    ...normalizeHttpActiveAttributes(input),
    "event.outcome": normalizeOutcome(input.outcome),
    "http.response.status_code_class": normalizeStatusClass(input.statusCode),
  };
}

export function normalizeJobMetricAttributes(
  input: JobMetricInput,
): MetricAttributes {
  return {
    "event.outcome": normalizeOutcome(input.outcome),
    "job.type": JOB_TYPES.has(input.jobType as MetricJobType)
      ? input.jobType
      : "unknown",
  };
}
