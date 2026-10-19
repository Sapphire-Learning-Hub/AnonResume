import {
  InMemorySpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { SafeTraceExporter } from "@/lib/observability/tracing/exporter";

it("exports code-defined diagnostics without exception text, URLs, events or resource secrets", async () => {
  const destination = new InMemorySpanExporter();
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      "service.name": "anonresume-web",
      secret: "private",
    }),
    spanProcessors: [
      new SimpleSpanProcessor(new SafeTraceExporter(destination)),
    ],
  });
  const span = provider
    .getTracer("third-party")
    .startSpan("GET /user/private-email");
  span.setAttributes({
    "url.full": "https://user:password@host",
    "db.query.text": "select private",
    "http.response.status_code": 500,
  });
  span.recordException(new Error("credential"));
  span.setStatus({ code: 2, message: "private error" });
  span.end();
  await provider.forceFlush();
  const [exported] = destination.getFinishedSpans();
  expect(exported?.name).toBe("framework.operation");
  expect(exported?.attributes).toEqual({ "http.response.status_code": 500 });
  expect(exported?.events).toEqual([]);
  expect(JSON.stringify(exported)).not.toMatch(/password|credential|private/);
  await provider.shutdown();
});
