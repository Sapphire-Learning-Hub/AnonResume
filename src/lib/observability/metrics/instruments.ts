import type { Meter } from "@opentelemetry/api";

import {
  normalizeHttpActiveAttributes,
  normalizeHttpMetricAttributes,
} from "./attributes";
import type {
  HttpMetricCompletion,
  HttpMetricInput,
  MetricAttributes,
  RuntimeMetricsSnapshot,
} from "./types";

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
}

export const applicationMetrics = new ApplicationMetrics();
