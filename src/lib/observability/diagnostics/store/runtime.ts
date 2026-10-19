import type { ManagedConfig } from "@/lib/config/registry";
import type { ConfigConsumer } from "@/lib/config/types";
import type { LogFields, LogLevel } from "@/lib/observability/logging/types";
import { DiagnosticRecorder } from "./buffer";
import type { DiagnosticPolicy } from "./schema";

interface StoreState {
  recorder?: DiagnosticRecorder;
  policy?: DiagnosticPolicy;
  starting?: Promise<void>;
  timer?: ReturnType<typeof setInterval>;
  stopping?: boolean;
  close?: () => Promise<void>;
}
const globalState = globalThis as typeof globalThis & { __anonresumeDiagnosticStore?: StoreState };
const state = globalState.__anonresumeDiagnosticStore ??= {};

export function diagnosticStorePolicy(values: ManagedConfig): DiagnosticPolicy {
  return {
    enabled: values.diagnosticsStoreEnabled ?? true,
    retentionDays: values.diagnosticsRetentionDays ?? 7,
    maxRecords: values.diagnosticsMaxRecords ?? 50_000,
    pendingTtlMs: Math.max(86_400_000, values.pdfForceExpiryMs + values.pdfLeaseMs + 60_000, values.aiRunLeaseSeconds * 1000 + 60_000),
  };
}
export function configureDiagnosticStore(values: ManagedConfig, consumer: ConfigConsumer) {
  state.policy = diagnosticStorePolicy(values);
  if (state.starting || state.recorder || !state.policy.enabled || state.stopping) return;
  state.starting = import("./writer").then(({ startDiagnosticWriter }) => startDiagnosticWriter(state, consumer)).catch(() => {
    process.stderr.write('{"event.action":"diagnostic_store_unavailable","log.level":"warn"}\n');
  }).finally(() => { state.starting = undefined; });
}
export function captureDiagnosticLog(level: LogLevel, dataset: string, action: string, fields: LogFields = {}) {
  if (state.policy?.enabled) state.recorder?.log(level, dataset, action, fields);
}
export function withLocalDiagnosticStage<T>(name: string, work: () => Promise<T>, taskId?: string) {
  return state.policy?.enabled && state.recorder ? state.recorder.stage(name, work, taskId) : work();
}
export function localDiagnosticStream<T>(name: string, source: AsyncIterable<T>): AsyncIterable<T> {
  return state.policy?.enabled && state.recorder ? state.recorder.stream(name,source) : source;
}
export function handoffDiagnosticTask(id: string, kind: "ai" | "pdf") {
  if (state.policy?.enabled) state.recorder?.task(id, kind, "active");
}
export function finishDiagnosticTask(id: string, kind: "ai" | "pdf", outcome: "success" | "failure" | "cancelled") {
  if (state.policy?.enabled) state.recorder?.task(id, kind, outcome);
}
export function suppressDiagnosticCollection() { state.recorder?.suppress(); }
export function diagnosticStoreHealth() {
  return state.recorder?.health() ?? { degraded: Boolean(state.policy?.enabled), dropped: 0, pending: 0 };
}
export async function stopDiagnosticStore() {
  state.stopping = true;
  if (state.timer) clearInterval(state.timer);
  await state.starting;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([state.recorder?.flush(),new Promise<void>((resolve) => { timer=setTimeout(resolve,3000); timer.unref(); })]);
  } finally { if (timer) clearTimeout(timer); }
  await state.close?.();
}
export type { StoreState };
