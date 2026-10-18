import type { Meter } from "@opentelemetry/api";

import {
  normalizeHttpActiveAttributes,
  normalizeHttpMetricAttributes,
} from "./attributes";
import type {
  HttpMetricCompletion,
  HttpMetricInput,
  MetricAttributes,
} from "./types";

interface ApplicationInstrumentBindings {
  httpActiveRequests: {
    add(value: number, attributes?: MetricAttributes): void;
  };
  httpRequestDuration: {
    record(value: number, attributes?: MetricAttributes): void;
  };
  httpRequests: {
    add(value: number, attributes?: MetricAttributes): void;
  };
}

function createApplicationInstrumentBindings(
  meter: Meter,
): ApplicationInstrumentBindings {
  return {
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
}

export const applicationMetrics = new ApplicationMetrics();
