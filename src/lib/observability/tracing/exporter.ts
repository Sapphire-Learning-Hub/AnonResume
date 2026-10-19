import type { Attributes } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-node";

const RESOURCE_KEYS = new Set([
  "service.name",
  "service.namespace",
  "service.version",
  "service.instance.id",
  "service.deployment.id",
  "service.build.id",
  "deployment.environment.name",
]);
const IDENTIFIER = /^[a-zA-Z0-9._/-]{1,128}$/;
const UUID = /^[0-9a-f-]{36}$/;

function safeAttributes(input: Attributes): Attributes {
  const result: Attributes = {};
  for (const [key, value] of Object.entries(input)) {
    if (
      ["diagnostic.id", "request.id", "transaction.id"].includes(key) &&
      typeof value === "string" &&
      UUID.test(value)
    )
      result[key] = value;
    if (
      [
        "app.stage",
        "event.outcome",
        "http.request.method",
        "error.type",
        "error.code",
      ].includes(key) &&
      typeof value === "string" &&
      IDENTIFIER.test(value)
    )
      result[key] = value;
    if (
      ["http.response.status_code", "app.attempt"].includes(key) &&
      typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= 0 &&
      value <= 999
    )
      result[key] = value;
  }
  return result;
}

// All spans pass this projection, including spans created by Next.js itself.
export class SafeTraceExporter implements SpanExporter {
  constructor(private readonly delegate: SpanExporter) {}
  export(
    spans: ReadableSpan[],
    callback: Parameters<SpanExporter["export"]>[1],
  ) {
    this.delegate.export(
      spans.map((span): ReadableSpan => ({
        kind: span.kind,
        startTime: span.startTime,
        endTime: span.endTime,
        duration: span.duration,
        ended: span.ended,
        parentSpanContext: span.parentSpanContext
          ? {
              traceId: span.parentSpanContext.traceId,
              spanId: span.parentSpanContext.spanId,
              traceFlags: span.parentSpanContext.traceFlags,
            }
          : undefined,
        droppedAttributesCount: span.droppedAttributesCount,
        droppedEventsCount: span.droppedEventsCount,
        droppedLinksCount: span.droppedLinksCount,
        name:
          span.instrumentationScope.name === "anonresume.diagnostics" &&
          /^app\.[a-z_.]{1,64}$/.test(span.name)
            ? span.name
            : "framework.operation",
        spanContext: () => {
          const value = span.spanContext();
          return {
            traceId: value.traceId,
            spanId: value.spanId,
            traceFlags: value.traceFlags,
          };
        },
        status: { code: span.status.code },
        attributes: safeAttributes(span.attributes),
        events: [],
        links: [],
        resource: resourceFromAttributes(
          Object.fromEntries(
            Object.entries(span.resource.attributes).filter(
              ([key, value]) =>
                RESOURCE_KEYS.has(key) &&
                typeof value === "string" &&
                value.length <= 128,
            ),
          ),
        ),
        instrumentationScope: { name: "anonresume.diagnostics" },
      })),
      callback,
    );
  }
  shutdown() {
    return this.delegate.shutdown();
  }
  forceFlush() {
    return this.delegate.forceFlush?.() ?? Promise.resolve();
  }
}
