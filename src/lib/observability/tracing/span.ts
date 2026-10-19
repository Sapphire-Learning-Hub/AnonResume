import { AsyncLocalStorage } from "node:async_hooks";
import {
  context,
  ROOT_CONTEXT,
  SpanStatusCode,
  trace,
  type Attributes,
} from "@opentelemetry/api";
import {
  getDiagnosticContext,
  getStoredDiagnosticContext,
} from "@/lib/observability/diagnostics/context";

const budgets = new AsyncLocalStorage<{ spans: number }>();
import { withLocalDiagnosticStage, localDiagnosticStream } from "@/lib/observability/diagnostics/store/runtime";

async function* withOtelDiagnosticStream<T>(
  name: string,
  source: AsyncIterable<T>,
): AsyncGenerator<T> {
  const budget = budgets.getStore() ?? { spans: 0 };
  if (++budget.spans > 256) {
    yield* source;
    return;
  }
  const parent = context.active();
  const span = trace
    .getTracer("anonresume.diagnostics")
    .startSpan(name, {}, parent);
  const active = trace.setSpan(parent, span);
  const iterator = source[Symbol.asyncIterator]();
  let done = false;
  try {
    while (!done) {
      const item = await context.with(active, () => iterator.next());
      done = Boolean(item.done);
      if (!done) yield item.value;
    }
  } catch (error) {
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw error;
  } finally {
    try {
      if (!done) await context.with(active, () => iterator.return?.());
    } finally {
      span.end();
    }
  }
}

export function withDiagnosticStream<T>(name: string, source: AsyncIterable<T>): AsyncIterable<T> {
  return localDiagnosticStream(name, withOtelDiagnosticStream(name,source));
}

async function withOtelDiagnosticSpan<T>(
  name: string,
  work: () => Promise<T>,
  attributes: Attributes = {},
  root = false,
): Promise<T> {
  const budget = root ? { spans: 0 } : (budgets.getStore() ?? { spans: 0 });
  if (++budget.spans > 256) return work();
  const diagnostic = root
    ? getStoredDiagnosticContext()
    : getDiagnosticContext();
  let parent = root ? ROOT_CONTEXT : context.active();
  if (root && diagnostic?.traceparent) {
    const [, traceId, spanId, flags] = diagnostic.traceparent.split("-");
    parent = trace.setSpanContext(parent, {
      traceId: traceId!,
      spanId: spanId!,
      traceFlags: flags === "01" ? 1 : 0,
      isRemote: true,
    });
  }
  const span = trace.getTracer("anonresume.diagnostics").startSpan(
    name,
    {
      attributes: {
        ...attributes,
        "diagnostic.id": diagnostic?.diagnosticId,
        "request.id": diagnostic?.originRequestId ?? undefined,
      },
    },
    parent,
  );
  return budgets.run(budget, () =>
    context.with(trace.setSpan(parent, span), async () => {
      try {
        return await work();
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    }),
  );
}

export function withDiagnosticSpan<T>(name: string, work: () => Promise<T>, attributes: Attributes = {}, root = false): Promise<T> {
  const taskId = typeof attributes["transaction.id"] === "string" ? attributes["transaction.id"] : undefined;
  return withLocalDiagnosticStage(name, () => withOtelDiagnosticSpan(name, work, attributes, root), taskId);
}
