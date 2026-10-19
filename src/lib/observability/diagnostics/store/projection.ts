import { createHash } from "node:crypto";
import type { LogFields, LogLevel, SafeErrorFields } from "@/lib/observability/logging/types";
import { serializeSafeError } from "@/lib/observability/logging/errors";
import { safeServerFrames } from "@/lib/observability/diagnostics/frames";
import type { DiagnosticEvent } from "./schema";

const stages = new Set(["app.http.request", "app.ai.execute", "app.pdf.execute", "app.pdf.render", "app.pdf.save", "app.ai.review.round", "app.ai.provider.round", "app.email.send", "task.queued", "task.finished"]);
const actions = new Set(["http_request_completed", "http_request_failed", "next_request_error", "browser_error_reported", "operation_failed", "resume_review_failed", "resume_review_audit_failed", "export_failed", "run_failed", "run_failure_evidence_persistence_failed", "worker_operation_failed", "worker_heartbeat_failed", "process_startup_failed"]);
const types = new Set(["Error", "TypeError", "RangeError", "SyntaxError", "ReferenceError", "URIError", "AggregateError", "DOMException", "AiProviderError", "ZodError", "DrizzleQueryError", "NonError"]);
export const safeStageName = (name: string) => stages.has(name) ? name : "app.operation";
export const safeActionName = (name: string) => actions.has(name) ? name : "application_error";

function code(value?: string) {
  if (!value) return null;
  const projected = serializeSafeError(Object.assign(new Error(), { code: value }));
  return projected.code ?? null;
}
export function projectStoredError(value?: SafeErrorFields): NonNullable<DiagnosticEvent["error"]> {
  const safeCode = code(value?.code) ?? value?.causes?.map((cause) => code(cause.code)).find(Boolean) ?? null;
  const category = safeCode?.startsWith("0") || /^\d{5}$/.test(safeCode ?? "") ? "database"
    : ["timeout", "ETIMEDOUT", "operation_timeout"].includes(safeCode ?? "") ? "timeout"
    : ["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ESOCKET", "ETLS", "CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "unavailable"].includes(safeCode ?? "") ? "network"
    : ["EAUTH", "authentication"].includes(safeCode ?? "") ? "authentication"
    : safeCode === "invalid_response" ? "protocol" : "application";
  return {
    type: types.has(value?.type ?? "") ? value!.type! : "Error",
    code: safeCode,
    fingerprint: /^[a-f0-9]{16,64}$/.test(value?.digest ?? "") ? value!.digest! : createHash("sha256").update(`${safeCode}:${value?.type ?? "Error"}`).digest("hex").slice(0, 16),
    category,
    frames: (safeServerFrames(`Error\n${value?.stackTrace ?? ""}`) ?? "").split("\n").filter(Boolean),
    causes: (value?.causes ?? []).slice(0, 4).map((cause) => ({ type: types.has(cause.type ?? "") ? cause.type! : "Error", code: code(cause.code) })),
  };
}
export function isSystemFault(level: LogLevel, fields: LogFields) {
  if (fields.labels?.cancelled === true || ["stopped", "cancelled", "interrupted"].includes(String(fields.labels?.failureCode ?? ""))) return false;
  if ((fields.statusCode ?? 0) >= 500) return true;
  if (fields.statusCode && fields.statusCode < 500) return false;
  if (["aborted", "request_invalid", "request_forbidden", "request_unauthorized", "resource_not_found", "operation_conflict"].includes(fields.error?.code ?? "")) return false;
  return level === "error";
}
export function eventSource(dataset: string): DiagnosticEvent["source"] {
  return dataset === "anonresume.browser" ? "browser" : dataset === "anonresume.http" ? "http" : dataset.startsWith("anonresume.ai") ? "ai" : dataset.startsWith("anonresume.pdf") ? "pdf" : "runtime";
}
