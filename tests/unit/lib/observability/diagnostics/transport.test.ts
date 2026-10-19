import { createServer } from "node:http";
import { once } from "node:events";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import {
  InMemorySpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import { context, ROOT_CONTEXT, trace } from "@opentelemetry/api";
import { withDiagnosticSpan } from "@/lib/observability/tracing/span";
import {
  createDiagnosticContext,
  getDiagnosticContext,
  runWithDiagnosticContext,
} from "@/lib/observability/diagnostics/context";
import { SafeTraceExporter } from "@/lib/observability/tracing/exporter";

it("does not forward OTLP credentials to a redirect destination", async () => {
  let forwarded = 0;
  let received = 0;
  const server = createServer((request, response) => {
    if (request.url === "/v1/traces") {
      received++;
      response.writeHead(307, { location: "/other" });
    } else {
      forwarded++;
      response.writeHead(200);
    }
    request.resume();
    response.end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("test_server_missing");
  const provider = new NodeTracerProvider({
    spanProcessors: [
      new SimpleSpanProcessor(
        new SafeTraceExporter(
          new OTLPTraceExporter({
            url: `http://127.0.0.1:${address.port}/v1/traces`,
            headers: { authorization: "Bearer test-only" },
            timeoutMillis: 1000,
          }),
        ),
      ),
    ],
  });
  try {
    provider.getTracer("anonresume.diagnostics").startSpan("app.test").end();
    await expect(provider.forceFlush()).rejects.toBeDefined();
    expect(received).toBe(1);
    expect(forwarded).toBe(0);
  } finally {
    await provider.shutdown();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it("isolates root operations from ambient spans, restores trusted task parents and caps child spans", async () => {
  const exporter = new InMemorySpanExporter();
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  provider.register({ propagator: null });
  try {
    const foreign = trace.setSpanContext(ROOT_CONTEXT, {
      traceId: "a".repeat(32),
      spanId: "b".repeat(16),
      traceFlags: 1,
      isRemote: true,
    });
    const diagnostic = createDiagnosticContext();
    await context.with(foreign, () =>
      runWithDiagnosticContext(diagnostic, () =>
        withDiagnosticSpan(
          "app.http.request",
          async () => {
            expect(getDiagnosticContext()?.traceparent).not.toContain(
              "a".repeat(32),
            );
            for (let i = 0; i < 300; i++)
              await withDiagnosticSpan("app.child", async () => undefined);
          },
          {},
          true,
        ),
      ),
    );
    expect(exporter.getFinishedSpans()).toHaveLength(256);
    await runWithDiagnosticContext(
      {
        ...diagnostic,
        traceparent: `00-${"c".repeat(32)}-${"d".repeat(16)}-01`,
      },
      () =>
        withDiagnosticSpan("app.pdf.execute", async () => undefined, {}, true),
    );
    expect(exporter.getFinishedSpans().at(-1)?.spanContext().traceId).toBe(
      "c".repeat(32),
    );
  } finally {
    await provider.shutdown();
    trace.disable();
    context.disable();
  }
});
