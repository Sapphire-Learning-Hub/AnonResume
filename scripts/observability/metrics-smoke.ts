import { readMetricsSmokeEnvironment } from "@/lib/config/process-environment";

interface PrometheusQueryResponse {
  data?: {
    result?: Array<{ value?: [number, string] }>;
  };
  status?: string;
}

export {};

interface PrometheusTargetsResponse {
  data?: {
    activeTargets?: Array<{
      health?: string;
      labels?: { job?: string };
    }>;
  };
  status?: string;
}

const argumentsSet = new Set(process.argv.slice(2));
const knownArguments = new Set(["--infrastructure-only"]);
const unknownArguments = [...argumentsSet].filter(
  (argument) => !knownArguments.has(argument),
);

if (unknownArguments.length > 0) {
  throw new Error(`Unknown arguments: ${unknownArguments.join(", ")}`);
}

const infrastructureOnly = argumentsSet.has("--infrastructure-only");
const environment = readMetricsSmokeEnvironment();
const prometheusUrl = environment.PROMETHEUS_URL?.trim() ||
  "http://127.0.0.1:9090";
const grafanaUrl = environment.GRAFANA_URL?.trim() ||
  "http://127.0.0.1:3001";

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) {
    throw new Error(`Observability endpoint returned HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function queryPrometheus(query: string) {
  const result = await readJson<PrometheusQueryResponse>(
    `${prometheusUrl}/api/v1/query?query=${encodeURIComponent(query)}`,
  );
  if (result.status !== "success") {
    throw new Error("Prometheus query did not succeed");
  }
  return Number(result.data?.result?.[0]?.value?.[1] ?? 0);
}

async function waitForApplicationMetrics(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await queryPrometheus('count({__name__=~"anonresume_.+"})') > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("No AnonResume metric series reached Prometheus in time");
}

await readJson(`${prometheusUrl}/api/v1/status/buildinfo`);
const targets = await readJson<PrometheusTargetsResponse>(
  `${prometheusUrl}/api/v1/targets`,
);
const targetHealth = new Map(
  (targets.data?.activeTargets ?? []).map((target) => [
    target.labels?.job,
    target.health,
  ]),
);
for (const job of ["anonresume", "otel-collector", "prometheus"]) {
  if (targetHealth.get(job) !== "up") {
    throw new Error(`Prometheus target is not up: ${job}`);
  }
}

const grafanaHealth = await readJson<{ database?: string }>(
  `${grafanaUrl}/api/health`,
);
if (grafanaHealth.database !== "ok") {
  throw new Error("Grafana database health check failed");
}

if (!infrastructureOnly) {
  await waitForApplicationMetrics();
  const services = await queryPrometheus(
    "count(count by (service_name) (anonresume_process_uptime_seconds))",
  );
  if (services < 1) {
    throw new Error("No AnonResume service uptime series is available");
  }
}

console.info(
  infrastructureOnly
    ? "Metrics infrastructure is healthy"
    : "Metrics infrastructure and AnonResume series are healthy",
);
