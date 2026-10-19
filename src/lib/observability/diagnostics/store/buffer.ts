import { AsyncLocalStorage } from "node:async_hooks";
import { getStoredDiagnosticContext, createDiagnosticContext } from "@/lib/observability/diagnostics/context";
import type { LogFields, LogLevel } from "@/lib/observability/logging/types";
import { eventSource, isSystemFault, projectStoredError, safeActionName, safeStageName } from "./projection";
import type { DiagnosticBatch, DiagnosticEvent, DiagnosticIdentity } from "./schema";
import { clientEventSchema } from "@/lib/observability/browser/schema";

interface Scope {
  diagnosticId: string;
  events: DiagnosticEvent[];
  retained: boolean;
  truncated: boolean;
  suppressed: boolean;
  taskStates?: Map<string,string>;
}
const scopes = new AsyncLocalStorage<Scope>();
const parents = new AsyncLocalStorage<string>();

export class DiagnosticRecorder {
  private queue: DiagnosticBatch[] = [];
  private writing: Promise<void> | undefined;
  private dropped = 0;
  private degraded = false;
  constructor(private readonly options: {
    identity: DiagnosticIdentity;
    write(batch: DiagnosticBatch): Promise<void>;
  }) {}

  health() { return { dropped: this.dropped, degraded: this.degraded, pending: this.queue.length }; }
  private event(name: string, kind: DiagnosticEvent["kind"]): DiagnosticEvent {
    const context = getStoredDiagnosticContext();
    return {
      version: 1,
      id: crypto.randomUUID(), parentId: parents.getStore() ?? null,
      requestId: context?.originRequestId ?? null, taskId: null,
      kind, name, source: eventSource(`anonresume.${this.options.identity.role.split("-")[0]}`),
      at: new Date().toISOString(), durationMs: null, attempt: null, timeoutPhase: null, outcome: "running",
      identity: this.options.identity, error: null, reference: null,
    };
  }
  private append(scope: Scope, event: DiagnosticEvent) {
    if (scope.events.length >= 256) {
      scope.truncated = true;
      this.dropped++;
      const index = scope.events.findIndex((item) => item.kind === "stage" && item.outcome !== "running");
      if (index < 0) return;
      scope.events.splice(index, 1);
    }
    scope.events.push(event);
    while (Buffer.byteLength(JSON.stringify(scope.events)) > 65_536) {
      const nonFault = scope.events.findIndex((item) => item.kind !== "fault" && item.parentId !== null && item.outcome !== "running");
      const fallback = scope.events.findIndex((item) => item.kind !== "fault");
      scope.events.splice(nonFault >= 0 ? nonFault : fallback >= 0 ? fallback : 0,1);
      scope.truncated = true; this.dropped++;
    }
  }
  private submit(scope: Scope, task?: DiagnosticBatch["task"]) {
    if (scope.suppressed || (!scope.retained && !task)) return;
    if (this.queue.length >= 128) { this.dropped++; this.degraded = true; return; }
    this.queue.push(structuredClone({ diagnosticId: scope.diagnosticId, events: scope.events, truncated: scope.truncated, ...(task ? { task } : {}) }));
    void this.flush();
  }
  async flush() {
    if (this.writing) return this.writing;
    this.writing = (async () => {
      while (this.queue.length) {
        const batch = this.queue.shift()!;
        try { await this.options.write(batch); this.degraded = false; }
        catch { this.dropped++; this.degraded = true; }
      }
    })().finally(() => { this.writing = undefined; if (this.queue.length) void this.flush(); });
    return this.writing;
  }
  async *stream<T>(name: string, source: AsyncIterable<T>): AsyncGenerator<T> {
    const diagnosticId = getStoredDiagnosticContext()?.diagnosticId ?? createDiagnosticContext().diagnosticId;
    const existing = scopes.getStore();
    const scope: Scope = existing?.diagnosticId === diagnosticId ? existing : { diagnosticId, events: [], retained: false, truncated: false, suppressed: false };
    const event = this.event(safeStageName(name), "stage");
    this.append(scope, event);
    const iterator = source[Symbol.asyncIterator]();
    const started = performance.now();
    const within = <V>(work: () => V) => scopes.run(scope, () => parents.run(event.id, work));
    let done = false;
    try {
      while (true) {
        const item = await within(() => iterator.next());
        if (item.done) { done = true; event.outcome = "success"; break; }
        yield item.value;
      }
    } catch (error) { event.outcome = "failure"; throw error; }
    finally {
      if (!done) { if (event.outcome === "running") event.outcome = "cancelled"; await within(() => iterator.return?.()); }
      event.durationMs = Math.max(0,performance.now()-started); this.submit(scope);
    }
  }
  async stage<T>(name: string, work: () => Promise<T>, taskId?: string): Promise<T> {
    const outer = scopes.getStore();
    const diagnosticId = getStoredDiagnosticContext()?.diagnosticId ?? createDiagnosticContext().diagnosticId;
    const scope: Scope = outer?.diagnosticId === diagnosticId ? outer : { diagnosticId, events: [], retained: false, truncated: false, suppressed: false };
    const event = this.event(safeStageName(name), "stage");
    event.taskId = taskId ?? null;
    this.append(scope, event);
    const started = performance.now();
    if (scope.retained) this.submit(scope);
    return scopes.run(scope, () => parents.run(event.id, async () => {
      try { const result = await work(); event.outcome = "success"; return result; }
      catch (error) { event.outcome = "failure"; throw error; }
      finally {
        event.durationMs = Math.max(0, performance.now() - started);
        this.submit(scope);
      }
    }));
  }
  suppress() { const scope = scopes.getStore(); if (scope) scope.suppressed = true; }
  log(level: LogLevel, dataset: string, action: string, fields: LogFields) {
    if (dataset === "anonresume.local" || dataset === "anonresume.diagnostics.store" || !isSystemFault(level, fields)) return;
    const outer = scopes.getStore();
    const diagnosticId = getStoredDiagnosticContext()?.diagnosticId ?? createDiagnosticContext().diagnosticId;
    const scope = outer?.diagnosticId === diagnosticId ? outer : { diagnosticId, events: [], retained: true, truncated: false, suppressed: false };
    if (scope.suppressed) return;
    // The outer HTTP 5xx access event must not duplicate an already recorded cause.
    if (action === "http_request_completed" && scope.events.some((event) => event.kind === "fault")) return;
    const event = this.event(safeActionName(action), "fault");
    event.source = action === "next_request_error" ? "framework" : eventSource(dataset);
    event.outcome = "failure";
    event.taskId = /^[a-f0-9-]{36}$/i.test(fields.transactionId ?? "") ? fields.transactionId! : null;
    event.error = projectStoredError(fields.error);
    const attempt = fields.labels?.attempts;
    if (typeof attempt === "number" && Number.isInteger(attempt) && attempt>=0 && attempt<=10_000) event.attempt = attempt;
    const phase = fields.labels?.timeoutPhase;
    if (phase === "connection" || phase === "first_chunk" || phase === "stream_idle" || phase === "total") event.timeoutPhase = phase;
    const digest = fields.details?.["next.error.digest"];
    if (typeof digest === "string" && /^[\w-]{1,128}$/.test(digest)) event.reference = { clientBuild: null, digest, clientFrames: [] };
    if (dataset === "anonresume.browser") {
      const client = clientEventSchema.safeParse({ eventId: fields.details?.["client.event.id"], kind: fields.labels?.kind, buildId: fields.details?.["client.build.id"], errorType: fields.error?.type, frames: fields.details?.["client.frames"], ...(digest ? { digest } : {}) });
      if (client.success) event.reference = { clientBuild: client.data.buildId, digest: client.data.digest ?? null, clientFrames: client.data.frames.slice(0,8) };
    }
    scope.retained = true;
    this.append(scope, event);
    this.submit(scope);
  }
  task(id: string, kind: "ai" | "pdf", state: NonNullable<DiagnosticBatch["task"]>["state"]) {
    const scope = scopes.getStore();
    if (!scope) return;
    scope.taskStates ??= new Map();
    const previous = scope.taskStates.get(id);
    if (previous && previous !== "active" && state !== "failure") return;
    if (state === "success" && scope.events.some((event) => event.kind === "fault" && event.taskId === id)) state = "failure";
    scope.taskStates.set(id,state);
    scope.retained = true;
    const event = this.event(state === "active" ? "task.queued" : "task.finished", "task");
    event.taskId = id; event.source = kind; event.outcome = state === "active" ? "running" : state;
    this.append(scope, event);
    this.submit(scope, { id, kind, state });
  }
}
