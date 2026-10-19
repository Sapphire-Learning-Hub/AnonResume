import { trace, SpanStatusCode } from "@opentelemetry/api";
import { getLogger, serializeSafeError } from "@/lib/observability/logging";
import { withDiagnosticSpan } from "@/lib/observability/tracing/span";
import { runWithDiagnosticContext, taskDiagnosticContext } from "./context";
import { finishDiagnosticTask, handoffDiagnosticTask } from "./store/runtime";

export function recordDiagnosticFailure(
  error: unknown,
  stage: string,
  transactionId?: string,
) {
  const safe = serializeSafeError(error);
  trace.getActiveSpan()?.setStatus({ code: SpanStatusCode.ERROR });
  trace
    .getActiveSpan()
    ?.setAttributes({
      "app.stage": stage,
      "error.type": safe.type ?? "Error",
      "error.code": safe.code ?? "unknown",
    });
  getLogger("anonresume.diagnostics").error("operation_failed", {
    error: safe,
    labels: { stage },
    transactionId,
    outcome: "failure",
  });
}

export function withTaskDiagnostics<T>(
  taskId: string,
  stored: unknown,
  kind: "ai" | "pdf",
  work: () => Promise<T>,
) {
  return runWithDiagnosticContext(taskDiagnosticContext(taskId, stored), () =>
    withDiagnosticSpan(
      `app.${kind}.execute`,
      async () => {
        handoffDiagnosticTask(taskId, kind);
        try {
          const result = await work();
          finishDiagnosticTask(taskId, kind, "success");
          return result;
        } catch (error) {
          recordDiagnosticFailure(error, `${kind}.execute`, taskId);
          finishDiagnosticTask(taskId, kind, serializeSafeError(error).code === "aborted" ? "cancelled" : "failure");
          throw error;
        }
      },
      { "transaction.id": taskId },
      true,
    ),
  );
}
