import { AsyncLocalStorage } from "node:async_hooks";
import { context, isSpanContextValid, trace } from "@opentelemetry/api";
import { diagnosticContextSchema, type DiagnosticContext } from "./schema";

// Next's instrumentation and route bundles may instantiate this module separately.
const shared = globalThis as typeof globalThis & {
  __anonresumeDiagnosticContext?: AsyncLocalStorage<DiagnosticContext>;
};
const storage = shared.__anonresumeDiagnosticContext ??= new AsyncLocalStorage<DiagnosticContext>();
export function getStoredDiagnosticContext() {
  return storage.getStore();
}
export function createDiagnosticContext(requestId?: string): DiagnosticContext {
  const id =
    requestId &&
    diagnosticContextSchema.shape.diagnosticId.safeParse(requestId).success
      ? requestId
      : crypto.randomUUID();
  return {
    version: 1,
    diagnosticId: id,
    originRequestId: requestId === id ? id : null,
    traceparent: null,
  };
}
export function getDiagnosticContext(): DiagnosticContext | undefined {
  const current = storage.getStore();
  if (!current) return;
  const span = trace.getSpanContext(context.active());
  return span && isSpanContextValid(span)
    ? {
        ...current,
        traceparent: `00-${span.traceId}-${span.spanId}-${span.traceFlags & 1 ? "01" : "00"}`,
      }
    : current;
}
export function runWithDiagnosticContext<T>(
  value: DiagnosticContext,
  work: () => T,
): T {
  return storage.run(Object.freeze(diagnosticContextSchema.parse(value)), work);
}
export function taskDiagnosticContext(
  taskId: string,
  stored: unknown,
): DiagnosticContext {
  const parsed = diagnosticContextSchema.safeParse(stored);
  return parsed.success
    ? parsed.data
    : { ...createDiagnosticContext(taskId), originRequestId: null };
}
