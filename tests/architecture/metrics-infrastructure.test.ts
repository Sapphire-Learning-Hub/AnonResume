import { readFile } from "node:fs/promises";
import path from "node:path";

async function read(relativePath: string) {
  return readFile(path.join(process.cwd(), relativePath), "utf8");
}

describe("optional metrics infrastructure", () => {
  it("pins an isolated, locally bound Collector, Prometheus, and Grafana stack", async () => {
    const base = await read("compose.yaml");
    const metrics = await read("compose.metrics.yaml");

    expect(base).not.toContain("otel-collector");
    expect(base).not.toContain("prometheus:");
    expect(base).not.toContain("grafana:");
    expect(metrics).toContain(
      "ghcr.io/open-telemetry/opentelemetry-collector-releases/opentelemetry-collector-contrib:0.162.0",
    );
    expect(metrics).toContain("prom/prometheus:v3.14.0");
    expect(metrics).toContain("grafana/grafana:13.2.2");
    expect(metrics.match(/127\.0\.0\.1:/g)).toHaveLength(3);
    expect(metrics.match(/healthcheck:/g)).toHaveLength(3);
    expect(metrics.match(/mem_limit:/g)).toHaveLength(3);
  });

  it("provisions collection, storage, rules, and a versioned dashboard", async () => {
    const collector = await read(
      "docker/observability/metrics/otel-collector.yaml",
    );
    const prometheus = await read(
      "docker/observability/metrics/prometheus.yaml",
    );
    const alerts = await read(
      "docker/observability/metrics/alerts.yaml",
    );
    const datasource = await read(
      "docker/observability/metrics/grafana/provisioning/datasources/prometheus.yaml",
    );
    const dashboardProvider = await read(
      "docker/observability/metrics/grafana/provisioning/dashboards/default.yaml",
    );
    const dashboard = await read(
      "docker/observability/metrics/grafana/dashboards/anonresume-overview.json",
    );

    expect(collector).toContain("otlp:");
    expect(collector).toContain("prometheus:");
    expect(collector).toContain("memory_limiter:");
    expect(collector).toContain("batch:");
    expect(prometheus).toContain("otel-collector:9464");
    expect(prometheus).toContain("otel-collector:8888");
    expect(prometheus).toContain("alerts.yaml");
    expect(alerts).toContain("AnonResumeHighHttpErrorRate");
    expect(alerts).toContain("AnonResumeQueueBacklogOldest");
    expect(datasource).toContain("http://prometheus:9090");
    expect(dashboardProvider).toContain("/var/lib/grafana/dashboards");
    expect(dashboard).toContain("anonresume_http_server_requests");
    expect(dashboard).toContain("anonresume_queue_jobs");
    expect(dashboard).toContain("anonresume_process_memory_usage");
    expect(dashboard).toContain("otelcol_receiver_accepted_metric_points");
  });

  it("keeps identifiers and free-form values out of metric attributes", async () => {
    const attributes = await read(
      "src/lib/observability/metrics/attributes.ts",
    );
    const instruments = await read(
      "src/lib/observability/metrics/instruments.ts",
    );
    const metricSources = `${attributes}\n${instruments}`;

    for (const forbidden of [
      "user.id",
      "user.email",
      "resume.id",
      "job.id",
      "request.id",
      "url.full",
      "exception.message",
      "ai.model",
      "ai.provider",
    ]) {
      expect(metricSources).not.toContain(`\"${forbidden}\"`);
    }
  });
});
